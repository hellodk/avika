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
// Endpoint is read from OTEL_EXPORTER_OTLP_ENDPOINT (default: avika-otel-gateway
// in monitoring namespace on port 4317). Set to "" to disable tracing.
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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Printf("Tracing: could not connect to OTel collector at %s: %v — tracing disabled", endpoint, err)
		otel.SetTracerProvider(sdktrace.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		log.Printf("Tracing: could not create OTLP exporter: %v — tracing disabled", err)
		otel.SetTracerProvider(sdktrace.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(version),
		semconv.DeploymentEnvironmentKey.String(getEnv("DEPLOYMENT_ENV", "production")),
	)

	tp := sdktrace.NewTracerProvider(
		// Sample 100% in development, 10% in production to keep overhead low.
		// Override with OTEL_TRACES_SAMPLER=parentbased_always_on for full sampling.
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(getSampleRate()))),
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

	log.Printf("Tracing: enabled → %s (service=%s version=%s sampleRate=%.0f%%)",
		endpoint, serviceName, version, getSampleRate()*100)

	return tp.Shutdown, nil
}

func getSampleRate() float64 {
	env := os.Getenv("OTEL_SAMPLE_RATE")
	switch env {
	case "0", "0.0", "never":
		return 0.0
	case "0.1", "10":
		return 0.10
	}
	// Default: 100% — send all spans to the Collector, which applies
	// tail sampling (keep 100% of errors/slow traces, 5% of fast ones).
	// Head sampling here would blind the Collector to 90% of slow requests.
	return 1.0
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
