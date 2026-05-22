package main

import (
	"context"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// initTracer sets up the OpenTelemetry trace provider and returns a shutdown
// function that flushes and closes the exporter cleanly.
//
// Endpoint is read from OTEL_EXPORTER_OTLP_ENDPOINT (default: otel-gateway
// in monitoring namespace on port 4317). Set to "disabled" to disable tracing.
func initTracer(serviceName, version string) (shutdown func(context.Context) error, err error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "otel-gateway.monitoring.svc.cluster.local:4317"
	}

	// Allow disabling tracing completely (useful in unit tests / local dev).
	if endpoint == "disabled" {
		log.Printf("Tracing: disabled (OTEL_EXPORTER_OTLP_ENDPOINT=disabled)")
		otel.SetTracerProvider(sdktrace.NewTracerProvider()) // no-op provider
		return func(context.Context) error { return nil }, nil
	}

	// grpc.NewClient is lazy — it does not dial immediately. We set a timeout
	// only for the exporter handshake below, not for the dial itself.
	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		// grpc.NewClient almost never errors (connection is lazy), but handle it.
		log.Printf("Tracing: could not create gRPC client for OTel collector at %s: %v — tracing disabled", endpoint, err)
		otel.SetTracerProvider(sdktrace.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	// Use a separate context for exporter creation only; cancel after New() returns.
	exportCtx, exportCancel := context.WithTimeout(context.Background(), 10*time.Second)
	exporter, err := otlptracegrpc.New(exportCtx, otlptracegrpc.WithGRPCConn(conn))
	exportCancel() // cancel only after New() — not deferred, to avoid premature cancellation
	if err != nil {
		log.Printf("Tracing: could not create OTLP exporter: %v — tracing disabled", err)
		otel.SetTracerProvider(sdktrace.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	// Merge with resource.Default() so telemetry.sdk.* and host.name are present,
	// as required by the OTel spec and expected by Grafana Tempo's service graph.
	res, _ := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(version),
			semconv.DeploymentEnvironmentKey.String(getEnv("DEPLOYMENT_ENV", "production")),
		),
	)

	tp := sdktrace.NewTracerProvider(
		// AlwaysSample: send 100% of spans to the Collector, which applies
		// tail sampling (keep all errors/slow traces, 5% of fast ones).
		// ParentBased would propagate "sampled=0" from upstream services,
		// which is wrong for a tail-sampling architecture.
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithBatcher(exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(512),
		),
		sdktrace.WithResource(res),
	)

	// Set global propagator so W3C traceparent/tracestate headers are read/written
	// on incoming and outgoing HTTP requests automatically.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	otel.SetTracerProvider(tp)

	log.Printf("Tracing: enabled → %s (service=%s version=%s sampler=always)",
		endpoint, serviceName, version)

	return tp.Shutdown, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
