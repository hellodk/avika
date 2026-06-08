# Avika Observability Architecture

> Full-stack observability: metrics · tracing · logging · alerting · dashboards

---

## Table of Contents

1. [Overview](#1-overview)
2. [Stack at a Glance](#2-stack-at-a-glance)
3. [Distributed Tracing — OpenTelemetry → Tempo](#3-distributed-tracing--opentelemetry--tempo)
4. [Metrics — Prometheus + Exemplars](#4-metrics--prometheus--exemplars)
5. [Structured Logging — zerolog → Loki](#5-structured-logging--zerolog--loki)
6. [Alerting — PrometheusRule → Alertmanager](#6-alerting--prometheusrule--alertmanager)
7. [Dashboards — Grafana](#7-dashboards--grafana)
8. [End-to-End Data Flow](#8-end-to-end-data-flow)
9. [Deployment Modes](#9-deployment-modes)
10. [Instrumentation Checklist](#10-instrumentation-checklist)

---

## 1. Overview

Avika uses a full OTEL-native observability stack across all six pillars: metrics, tracing, logging, alerting, dashboards, and health probes. The architecture is designed for the solo-operator pattern — all signals are correlated by `trace_id` so that a single alert in Alertmanager leads to a Grafana dashboard, a Tempo trace, and the exact log lines that explain the failure, without requiring a dedicated ops team to interpret them. Data flows from the instrumented Go gateway through an OTel Collector (with tail sampling) to Grafana Tempo for traces, Prometheus for metrics, and Loki for logs, with Grafana as the unified visualization layer across all three signals.

---

## 2. Stack at a Glance

| Pillar | Tool | Location |
|--------|------|----------|
| Metrics | Prometheus + `avika_*` metrics | `/metrics` on port 5022 |
| Tracing | OpenTelemetry SDK (Go) + Grafana Tempo | OTLP/gRPC → `otel-gateway.monitoring:4317` → `avika-tempo.monitoring:4317` |
| Logging | zerolog (JSON structured) + Loki | stdout → Promtail DaemonSet → Loki |
| Alerting | PrometheusRule + Alertmanager | `deploy/k8s/avika-observability.yaml` |
| Dashboards | Grafana ConfigMap provisioning | `avika` namespace, label `grafana_dashboard: "1"` |
| Health | `/healthz`, `livenessProbe`, `readinessProbe` | k8s container probes on all pods |

**Port reference:**

| Port | Service | Purpose |
|------|---------|---------|
| 5020 | Gateway | gRPC server (agent connections) |
| 5021 | Gateway | HTTP server (WebSocket, reports) |
| 5022 | Gateway | Prometheus `/metrics` endpoint |
| 5025 | Agent | Management gRPC (gateway → agent) |
| 5026 | Agent | Health check HTTP |
| 4317 | OTel Collector | OTLP gRPC receiver |
| 4318 | OTel Collector | OTLP HTTP receiver |
| 8888 | OTel Collector | Self-metrics (Prometheus) |

---

## 3. Distributed Tracing — OpenTelemetry → Tempo

### Architecture

Every incoming HTTP request enters the gateway through an `otelhttp.NewHandler` wrapper that creates the root span. Child spans are created automatically for outbound gRPC calls (via `otelgrpc.NewClientHandler`) and manually for database operations (via `db.dbSpan(ctx, op, table)`). All spans are exported via OTLP/gRPC to the OTel Collector, which applies tail sampling before forwarding to Grafana Tempo.

### Trace Data Flow

<svg viewBox="0 0 900 320" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Avika Distributed Tracing Data Flow">
  <defs>
    <marker id="arrowBlue3" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#3B82F6"/>
    </marker>
    <marker id="arrowPurple3" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#8B5CF6"/>
    </marker>
    <marker id="arrowAmber3" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F59E0B"/>
    </marker>
    <marker id="arrowOrange3" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F97316"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="900" height="320" fill="#F8FAFC" rx="8"/>

  <!-- Title -->
  <text x="450" y="28" text-anchor="middle" font-size="14" font-weight="600" fill="#1E293B">Distributed Trace Data Flow — HTTP Request → Grafana Tempo</text>

  <!-- Row 1: Span nodes -->
  <!-- HTTP Request -->
  <rect x="24" y="60" width="130" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="89" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">HTTP Request</text>
  <text x="89" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">Incoming</text>

  <!-- otelhttp middleware -->
  <rect x="194" y="60" width="130" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="259" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">otelhttp</text>
  <text x="259" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">Root Span</text>

  <!-- Handler Span -->
  <rect x="364" y="60" width="130" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="429" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Handler Span</text>
  <text x="429" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">Business Logic</text>

  <!-- gRPC Span -->
  <rect x="534" y="40" width="120" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="594" y="59" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">gRPC Span</text>
  <text x="594" y="76" text-anchor="middle" font-size="10" fill="#94A3B8">Agent RPC</text>

  <!-- DB Span -->
  <rect x="534" y="100" width="120" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="594" y="119" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">DB Span</text>
  <text x="594" y="136" text-anchor="middle" font-size="10" fill="#94A3B8">PostgreSQL</text>

  <!-- OTEL Collector -->
  <rect x="700" y="60" width="130" height="44" rx="8" fill="#1E293B" stroke="#8B5CF6" stroke-width="2"/>
  <text x="765" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">OTEL Collector</text>
  <text x="765" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">Tail Sampling</text>

  <!-- Row 2: Tempo and Grafana -->
  <!-- Grafana Tempo -->
  <rect x="630" y="190" width="130" height="44" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="695" y="209" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Grafana Tempo</text>
  <text x="695" y="226" text-anchor="middle" font-size="10" fill="#94A3B8">Trace Storage</text>

  <!-- Grafana Explore -->
  <rect x="420" y="190" width="130" height="44" rx="8" fill="#1E293B" stroke="#F97316" stroke-width="2"/>
  <text x="485" y="209" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Grafana Explore</text>
  <text x="485" y="226" text-anchor="middle" font-size="10" fill="#94A3B8">Trace View</text>

  <!-- Arrows Row 1 - horizontal -->
  <line x1="154" y1="82" x2="188" y2="82" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowBlue3)"/>
  <line x1="324" y1="82" x2="358" y2="82" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowBlue3)"/>

  <!-- Handler → gRPC (L-bend: right then up) -->
  <polyline points="494,70 520,70 520,62 528,62" stroke="#3B82F6" stroke-width="1.5" fill="none" marker-end="url(#arrowBlue3)"/>

  <!-- Handler → DB (L-bend: right then down) -->
  <polyline points="494,92 520,92 520,122 528,122" stroke="#3B82F6" stroke-width="1.5" fill="none" marker-end="url(#arrowBlue3)"/>

  <!-- gRPC → OTEL Collector (L-bend: right then down) -->
  <polyline points="654,62 680,62 680,78 694,78" stroke="#8B5CF6" stroke-width="2" fill="none" marker-end="url(#arrowPurple3)"/>

  <!-- DB → OTEL Collector (L-bend: right then up) -->
  <polyline points="654,122 680,122 680,86 694,86" stroke="#8B5CF6" stroke-width="2" fill="none" marker-end="url(#arrowPurple3)"/>

  <!-- OTEL → Tempo (L-bend: down) -->
  <polyline points="765,104 765,165 695,165 695,184" stroke="#F59E0B" stroke-width="2" fill="none" marker-end="url(#arrowAmber3)"/>

  <!-- Tempo → Grafana (horizontal) -->
  <line x1="630" y1="212" x2="556" y2="212" stroke="#F97316" stroke-width="2" marker-end="url(#arrowOrange3)"/>

  <!-- Animated dots — trace packets -->
  <!-- Dot 1: HTTP → otelhttp -->
  <circle r="5" fill="#3B82F6" opacity="0.9">
    <animateMotion dur="2.5s" repeatCount="indefinite" begin="0s">
      <mpath>
        <path d="M 154,82 L 188,82"/>
      </mpath>
    </animateMotion>
  </circle>

  <!-- Dot 2: otelhttp → Handler -->
  <circle r="5" fill="#3B82F6" opacity="0.9">
    <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.5s">
      <mpath>
        <path d="M 324,82 L 358,82"/>
      </mpath>
    </animateMotion>
  </circle>

  <!-- Dot 3: spans → Collector -->
  <circle r="5" fill="#8B5CF6" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="1s">
      <mpath>
        <path d="M 654,62 L 680,62 L 680,78 L 694,78"/>
      </mpath>
    </animateMotion>
  </circle>

  <!-- Dot 4: Collector → Tempo -->
  <circle r="5" fill="#F59E0B" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="1.5s">
      <mpath>
        <path d="M 765,104 L 765,165 L 695,165 L 695,184"/>
      </mpath>
    </animateMotion>
  </circle>

  <!-- Dot 5: Tempo → Grafana -->
  <circle r="5" fill="#F97316" opacity="0.9">
    <animateMotion dur="2.5s" repeatCount="indefinite" begin="2s">
      <mpath>
        <path d="M 630,212 L 556,212"/>
      </mpath>
    </animateMotion>
  </circle>

  <!-- Legend -->
  <rect x="24" y="265" width="12" height="12" fill="#3B82F6" rx="2"/>
  <text x="42" y="276" font-size="11" fill="#4B5563">HTTP / Handler Spans</text>
  <rect x="180" y="265" width="12" height="12" fill="#8B5CF6" rx="2"/>
  <text x="198" y="276" font-size="11" fill="#4B5563">OTEL Collector (Tail Sampling)</text>
  <rect x="400" y="265" width="12" height="12" fill="#F59E0B" rx="2"/>
  <text x="418" y="276" font-size="11" fill="#4B5563">Grafana Tempo</text>
  <rect x="530" y="265" width="12" height="12" fill="#F97316" rx="2"/>
  <text x="548" y="276" font-size="11" fill="#4B5563">Grafana Explore / Trace View</text>
</svg>

### OTel SDK Initialization

```go
// cmd/gateway/tracer.go
func initTracer(serviceName, version string) (shutdown func(context.Context) error, err error) {
    endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint == "" {
        endpoint = "otel-gateway.monitoring.svc.cluster.local:4317"
    }

    conn, _ := grpc.NewClient(endpoint,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )

    exporter, _ := otlptracegrpc.New(exportCtx, otlptracegrpc.WithGRPCConn(conn))

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
        // AlwaysSample: send 100% of spans to the Collector.
        // The Collector applies tail sampling (errors + slow traces kept; 5% baseline).
        // ParentBased would propagate "sampled=0" from upstream and break tail-sampling.
        sdktrace.WithSampler(sdktrace.AlwaysSample()),
        sdktrace.WithBatcher(exporter,
            sdktrace.WithBatchTimeout(5*time.Second),
            sdktrace.WithMaxExportBatchSize(512),
        ),
        sdktrace.WithResource(res),
    )

    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))
    otel.SetTracerProvider(tp)
    return tp.Shutdown, nil
}
```

### Instrumentation Points

| Layer | Instrumentation | Code Location |
|-------|----------------|---------------|
| HTTP server | `otelhttp.NewHandler(handler, "avika-gateway")` | `cmd/gateway/main.go:2359` |
| gRPC server (agent RPCs) | `grpc.StatsHandler(otelgrpc.NewServerHandler())` | `cmd/gateway/main.go:1448` |
| gRPC client (outbound to agents) | `grpc.WithStatsHandler(otelgrpc.NewClientHandler())` | `cmd/gateway/main.go:995` |
| PostgreSQL operations | `db.tracer.Start(ctx, op+" "+table, ...)` | `cmd/gateway/database.go:65` |

### Database Span Pattern

```go
// cmd/gateway/database.go
func (db *DB) dbSpan(ctx context.Context, op, table string) (context.Context, trace.Span) {
    return db.tracer.Start(ctx, op+" "+table,
        trace.WithSpanKind(trace.SpanKindClient),
        trace.WithAttributes(
            attribute.String("db.system", "postgresql"),
            attribute.String("db.name", "avika"),
            attribute.String("db.operation", op),
            attribute.String("db.sql.table", table),
        ),
    )
}
```

### Tail Sampling Policy (OTel Collector)

The collector buffers spans for up to 30 seconds then makes a keep/drop decision per trace:

| Policy | Rule | Retention |
|--------|------|-----------|
| `always-sample-errors` | `status_code = ERROR` | 100% |
| `always-sample-slow` | `latency > 500ms` | 100% |
| `probabilistic-baseline` | All other traces | 5% |

This means every failure and every slow operation is captured, while the baseline traffic contributes a 5% statistical sample.

### Key Configuration Values

| Setting | Value |
|---------|-------|
| OTLP export target (k8s) | `otel-gateway.monitoring.svc.cluster.local:4317` |
| Tempo ingestion endpoint | `avika-tempo.monitoring.svc.cluster.local:4317` |
| SDK sampler | `AlwaysSample` (tail-sampling happens in collector) |
| Batch timeout | 5s |
| Max export batch size | 512 spans |
| W3C propagator | `TraceContext` + `Baggage` |

---

## 4. Metrics — Prometheus + Exemplars

### Metrics Pipeline

<svg viewBox="0 0 860 300" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Avika Metrics Pipeline">
  <defs>
    <marker id="arrowGreen4" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#10B981"/>
    </marker>
    <marker id="arrowBlue4" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#3B82F6"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="860" height="300" fill="#F8FAFC" rx="8"/>

  <!-- Title -->
  <text x="430" y="28" text-anchor="middle" font-size="14" font-weight="600" fill="#1E293B">Metrics Pipeline — Gateway /metrics → Prometheus → Grafana</text>

  <!-- Gateway /metrics -->
  <rect x="30" y="100" width="150" height="54" rx="8" fill="#1E293B" stroke="#10B981" stroke-width="2"/>
  <text x="105" y="122" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Gateway</text>
  <text x="105" y="139" text-anchor="middle" font-size="11" fill="#10B981">:5022/metrics</text>
  <text x="105" y="153" text-anchor="middle" font-size="9" fill="#94A3B8">Prometheus format</text>

  <!-- ServiceMonitor -->
  <rect x="220" y="60" width="140" height="44" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="290" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">ServiceMonitor</text>
  <text x="290" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">avika namespace</text>

  <!-- Prometheus -->
  <rect x="220" y="140" width="140" height="54" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="290" y="162" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Prometheus</text>
  <text x="290" y="179" text-anchor="middle" font-size="10" fill="#94A3B8">TSDB, scrape every 15s</text>
  <text x="290" y="192" text-anchor="middle" font-size="9" fill="#94A3B8">monitoring namespace</text>

  <!-- PromQL / Recording Rules -->
  <rect x="410" y="140" width="150" height="54" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="485" y="162" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">PromQL</text>
  <text x="485" y="179" text-anchor="middle" font-size="10" fill="#94A3B8">Histogram quantiles</text>
  <text x="485" y="192" text-anchor="middle" font-size="9" fill="#94A3B8">Error rate · Exemplars</text>

  <!-- Grafana -->
  <rect x="610" y="100" width="140" height="54" rx="8" fill="#1E293B" stroke="#F97316" stroke-width="2"/>
  <text x="680" y="122" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Grafana</text>
  <text x="680" y="139" text-anchor="middle" font-size="10" fill="#94A3B8">Dashboard + Exemplars</text>
  <text x="680" y="153" text-anchor="middle" font-size="9" fill="#94A3B8">Click → Tempo trace</text>

  <!-- Alertmanager -->
  <rect x="610" y="185" width="140" height="44" rx="8" fill="#1E293B" stroke="#EF4444" stroke-width="2"/>
  <text x="680" y="204" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Alertmanager</text>
  <text x="680" y="221" text-anchor="middle" font-size="10" fill="#94A3B8">PrometheusRule alerts</text>

  <!-- Arrows -->
  <!-- ServiceMonitor discovers Gateway (vertical L-bend) -->
  <polyline points="290,104 290,127 182,127 182,127" stroke="#3B82F6" stroke-width="1.5" fill="none" stroke-dasharray="5,3"/>
  <text x="220" y="118" text-anchor="middle" font-size="9" fill="#3B82F6">discovers</text>

  <!-- Gateway → Prometheus (scrape: right then down) -->
  <polyline points="180,127 205,127 205,167 214,167" stroke="#10B981" stroke-width="2" fill="none" marker-end="url(#arrowGreen4)"/>

  <!-- Prometheus → PromQL -->
  <line x1="360" y1="167" x2="404" y2="167" stroke="#F59E0B" stroke-width="2" marker-end="url(#arrowGreen4)"/>

  <!-- PromQL → Grafana (L-bend: right then up) -->
  <polyline points="560,160 585,160 585,130 604,130" stroke="#F97316" stroke-width="2" fill="none" marker-end="url(#arrowBlue4)"/>

  <!-- Prometheus → Alertmanager (L-bend: right then down) -->
  <polyline points="360,177 390,177 390,207 604,207" stroke="#EF4444" stroke-width="2" fill="none" marker-end="url(#arrowBlue4)"/>

  <!-- Animated dots — green metrics packets -->
  <circle r="5" fill="#10B981" opacity="0.9">
    <animateMotion dur="2.8s" repeatCount="indefinite" begin="0s">
      <mpath><path d="M 180,127 L 205,127 L 205,167 L 214,167"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#F59E0B" opacity="0.9">
    <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.8s">
      <mpath><path d="M 360,167 L 404,167"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#F97316" opacity="0.9">
    <animateMotion dur="2.8s" repeatCount="indefinite" begin="1.6s">
      <mpath><path d="M 560,160 L 585,160 L 585,130 L 604,130"/></mpath>
    </animateMotion>
  </circle>

  <!-- Legend -->
  <rect x="30" y="255" width="12" height="12" fill="#10B981" rx="2"/>
  <text x="48" y="266" font-size="11" fill="#4B5563">Prometheus Scrape (15s interval)</text>
  <rect x="270" y="255" width="12" height="12" fill="#F59E0B" rx="2"/>
  <text x="288" y="266" font-size="11" fill="#4B5563">TSDB Query / PromQL</text>
  <rect x="470" y="255" width="12" height="12" fill="#EF4444" rx="2"/>
  <text x="488" y="266" font-size="11" fill="#4B5563">Alert Evaluation → Alertmanager</text>
</svg>

### Metric Inventory

| Metric | Type | Labels | Notes |
|--------|------|--------|-------|
| `avika_http_requests_total` | Counter | `method`, `path`, `status` | Uses Go 1.22 route pattern to avoid UUID cardinality |
| `avika_http_request_duration_seconds` | Histogram | `method`, `path` | Carries `traceID` exemplars when span is sampled |
| `nginx_gateway_agents_total` | Gauge | `status` (`online`/`offline`) | Fleet health indicator |
| `nginx_gateway_goroutines` | Gauge | — | Goroutine leak detection |
| `nginx_gateway_memory_alloc_bytes` | Gauge | — | Heap allocation |
| `nginx_gateway_memory_sys_bytes` | Gauge | — | Total system memory |
| `nginx_gateway_db_latency_avg_ms` | Gauge | — | PostgreSQL average latency |
| `nginx_gateway_db_operations_total` | Counter | — | Total DB operations |
| `nginx_gateway_gc_pause_total_ns` | Counter | — | Go GC pause time |
| `nginx_gateway_info` | Gauge | `version` | Gateway liveness indicator |

### Exemplars: Metric → Trace Navigation

The HTTP duration histogram emits an exemplar on every sampled request, linking the metric data point directly to the originating trace:

```go
// cmd/gateway/httpprom.go
obs := avikaHTTPRequestDurationSeconds.WithLabelValues(method, path)
span := trace.SpanFromContext(r.Context())
if eo, ok := obs.(prometheus.ExemplarObserver); ok &&
   span.SpanContext().IsValid() && span.SpanContext().IsSampled() {
    eo.ObserveWithExemplar(
        duration.Seconds(),
        prometheus.Labels{"traceID": span.SpanContext().TraceID().String()},
    )
} else {
    obs.Observe(duration.Seconds())
}
```

In Grafana, clicking a diamond on a histogram panel opens the exact Tempo trace for that request.

### Cardinality Controls

- **Route pattern labels**: `r.Pattern` (Go 1.22 ServeMux) is used instead of `r.URL.Path` to prevent UUID/agent-ID proliferation in label values.
- **No per-agent labels on HTTP metrics**: agent-specific data lives in gRPC-level spans, not in Prometheus counters.
- **Status code as string**: `"200"`, `"404"`, `"500"` — finite set, safe cardinality.

---

## 5. Structured Logging — zerolog → Loki

### Log Format

Every log line emitted by the gateway is JSON-structured with mandatory fields:

```json
{
  "level": "info",
  "time": "2026-06-08T10:30:00Z",
  "service": "avika-gateway",
  "version": "1.122.0",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "method": "POST",
  "path": "/api/v1/agents/register",
  "remote_addr": "10.0.1.54",
  "status": 200,
  "duration": "45.3ms",
  "bytes": 1248
}
```

**`trace_id` and `span_id`** are extracted from the active OTel span context at the gRPC stream level (`trace.SpanFromContext(stream.Context())`) and injected into every log event for that request. This is the link that Grafana uses in its "Derived Fields" feature to navigate from a log line directly to the Tempo trace.

### Logger Initialization

```go
// internal/common/logging/logger.go
logger := zerolog.New(os.Stdout).
    With().
    Timestamp().
    Str("service", cfg.Service).
    Str("version", cfg.Version).
    Logger()
```

For HTTP requests, trace context is added in the gRPC stream interceptor:

```go
// cmd/gateway/main.go
span := trace.SpanFromContext(stream.Context())
traceID := span.SpanContext().TraceID().String()
spanID  := span.SpanContext().SpanID().String()
ev = ev.Str("trace_id", traceID).Str("span_id", spanID)
```

### Log Shipping Pipeline

```
Gateway stdout (JSON)
      │
      ▼ (pod log rotation)
Kubernetes node /var/log/pods/
      │
      ▼
Promtail DaemonSet
  - Tails all pod logs in avika namespace
  - Adds labels: {app="avika", namespace="avika", component="gateway"}
  - Parses JSON field "trace_id" as a structured label
      │
      ▼
Loki (log aggregation)
      │
      ▼
Grafana (LogQL queries + Derived Fields → Tempo)
```

### Grafana Derived Fields Configuration

In the Loki datasource settings, add a Derived Field that extracts `trace_id` from the JSON log and links to Tempo:

```yaml
derivedFields:
  - name: TraceID
    matcherRegex: '"trace_id":"([a-f0-9]+)"'
    url: '${__value.raw}'
    datasourceUid: tempo
```

This creates a clickable link on every log line that has a `trace_id`, opening the corresponding trace in Grafana Tempo.

### Log Levels by Event Type

| Event | Level | Fields |
|-------|-------|--------|
| HTTP request (2xx/3xx) | `info` | method, path, status, duration, bytes |
| HTTP request (4xx) | `warn` | method, path, status, duration, bytes |
| HTTP request (5xx) | `error` | method, path, status, duration, bytes |
| gRPC request | `info` / `error` | grpc_method, duration, trace_id, span_id |
| DB query | `debug` | query (truncated to 200 chars), duration, rows_affected |
| Agent connect / disconnect | `info` | agent_id, hostname, ip, event |
| Startup / shutdown | `info` | service, version, endpoint |

---

## 6. Alerting — PrometheusRule → Alertmanager

### Alert Pipeline

<svg viewBox="0 0 840 280" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Avika Alert Pipeline">
  <defs>
    <marker id="arrowRed6" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#EF4444"/>
    </marker>
    <marker id="arrowAmber6" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F59E0B"/>
    </marker>
    <marker id="arrowOrange6" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F97316"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="840" height="280" fill="#F8FAFC" rx="8"/>

  <!-- Title -->
  <text x="420" y="28" text-anchor="middle" font-size="14" font-weight="600" fill="#1E293B">Alert Pipeline — PrometheusRule → Alertmanager → Oncall</text>

  <!-- PrometheusRule YAML -->
  <rect x="24" y="90" width="150" height="54" rx="8" fill="#1E293B" stroke="#8B5CF6" stroke-width="2"/>
  <text x="99" y="112" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">PrometheusRule</text>
  <text x="99" y="129" text-anchor="middle" font-size="10" fill="#94A3B8">avika-observability.yaml</text>
  <text x="99" y="142" text-anchor="middle" font-size="9" fill="#94A3B8">avika namespace</text>

  <!-- Prometheus evaluation -->
  <rect x="220" y="90" width="150" height="54" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="295" y="112" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Prometheus</text>
  <text x="295" y="129" text-anchor="middle" font-size="10" fill="#94A3B8">Evaluates every 30s</text>
  <text x="295" y="142" text-anchor="middle" font-size="9" fill="#94A3B8">monitoring namespace</text>

  <!-- Alertmanager -->
  <rect x="420" y="90" width="150" height="54" rx="8" fill="#1E293B" stroke="#EF4444" stroke-width="2"/>
  <text x="495" y="112" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Alertmanager</text>
  <text x="495" y="129" text-anchor="middle" font-size="10" fill="#94A3B8">Routes + Inhibitions</text>
  <text x="495" y="142" text-anchor="middle" font-size="9" fill="#94A3B8">Dedup · Grouping</text>

  <!-- Oncall / PagerDuty -->
  <rect x="620" y="60" width="150" height="44" rx="8" fill="#1E293B" stroke="#F97316" stroke-width="2"/>
  <text x="695" y="79" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Oncall / PagerDuty</text>
  <text x="695" y="96" text-anchor="middle" font-size="10" fill="#94A3B8">Critical alerts</text>

  <!-- Email / Slack -->
  <rect x="620" y="130" width="150" height="44" rx="8" fill="#1E293B" stroke="#F97316" stroke-width="1.5"/>
  <text x="695" y="149" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Email / Slack</text>
  <text x="695" y="166" text-anchor="middle" font-size="10" fill="#94A3B8">Warning alerts</text>

  <!-- Arrows -->
  <line x1="174" y1="117" x2="214" y2="117" stroke="#F59E0B" stroke-width="2" marker-end="url(#arrowAmber6)"/>
  <line x1="370" y1="117" x2="414" y2="117" stroke="#EF4444" stroke-width="2" marker-end="url(#arrowRed6)"/>
  <polyline points="570,107 595,107 595,82 614,82" stroke="#F97316" stroke-width="2" fill="none" marker-end="url(#arrowOrange6)"/>
  <polyline points="570,127 595,127 595,152 614,152" stroke="#F97316" stroke-width="1.5" fill="none" marker-end="url(#arrowOrange6)"/>

  <!-- Interval annotation -->
  <text x="295" y="175" text-anchor="middle" font-size="10" fill="#8B5CF6">interval: 30s (avika.gateway group)</text>

  <!-- Animated dots -->
  <circle r="5" fill="#F59E0B" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="0s">
      <mpath><path d="M 174,117 L 214,117"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#EF4444" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="1s">
      <mpath><path d="M 370,117 L 414,117"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#F97316" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="2s">
      <mpath><path d="M 570,107 L 595,107 L 595,82 L 614,82"/></mpath>
    </animateMotion>
  </circle>

  <!-- Legend -->
  <rect x="24" y="235" width="12" height="12" fill="#8B5CF6" rx="2"/>
  <text x="42" y="246" font-size="11" fill="#4B5563">PrometheusRule (avika namespace)</text>
  <rect x="270" y="235" width="12" height="12" fill="#F59E0B" rx="2"/>
  <text x="288" y="246" font-size="11" fill="#4B5563">Prometheus Evaluation</text>
  <rect x="460" y="235" width="12" height="12" fill="#EF4444" rx="2"/>
  <text x="478" y="246" font-size="11" fill="#4B5563">Alertmanager Routing</text>
</svg>

### Alert Inventory

All alert rules live in `deploy/k8s/avika-observability.yaml` under the `avika.gateway` rule group (evaluation interval: 30s).

| Alert | Severity | Expression | For | Action |
|-------|----------|-----------|-----|--------|
| `AvikaGatewayDown` | **critical** | `absent(nginx_gateway_info)` | 2m | Gateway pod is down or metrics unreachable |
| `AvikaHighErrorRate` | warning | 5xx rate > 5% of all requests | 5m | Check gateway logs, DB connectivity |
| `AvikaHighLatency` | warning | `histogram_quantile(0.95, ...) > 2s` by path | 5m | Trace slow path in Tempo |
| `AvikaAllAgentsOffline` | **critical** | `nginx_gateway_agents_total{status="online"} == 0` | 5m | All fleet agents unreachable |
| `AvikaAgentsDroppingOff` | warning | Online agents < 80% of 15m-ago value | 5m | Network partition or agent crash |
| `AvikaGatewayHighMemory` | warning | `nginx_gateway_memory_alloc_bytes > 500MiB` | 10m | Possible memory leak; check pprof |
| `AvikaGoroutineLeak` | warning | `nginx_gateway_goroutines > 1000` | 15m | Goroutine leak; check pprof |
| `AvikaSlowDatabase` | warning | `nginx_gateway_db_latency_avg_ms > 200` | 5m | PostgreSQL performance issue |

### Alert Annotations

Every alert includes `summary` (one-line Slack/PagerDuty title) and `description` (context with metric values via template functions like `{{ $value | humanizeDuration }}`). Runbook links should be added to `annotations.runbook_url` pointing to the relevant section of this document.

---

## 7. Dashboards — Grafana

Dashboards are provisioned as a Kubernetes `ConfigMap` with label `grafana_dashboard: "1"`. The Grafana sidecar picks them up automatically without a restart.

**ConfigMap location**: `deploy/k8s/avika-observability.yaml`  
**Dashboard UID**: `avika-gateway-overview`  
**Dashboard title**: `Avika — Gateway Overview`

### Panel Inventory

| Row | Panel | Type | PromQL |
|-----|-------|------|--------|
| 1 | Gateway Up | Stat (green/red) | `nginx_gateway_info` |
| 1 | Online Agents | Stat | `nginx_gateway_agents_total{status="online"}` |
| 1 | Goroutines | Stat (threshold) | `nginx_gateway_goroutines` |
| 1 | Memory Alloc | Stat (bytes) | `nginx_gateway_memory_alloc_bytes` |
| 1 | DB Avg Latency | Stat (ms) | `nginx_gateway_db_latency_avg_ms` |
| 1 | Error Rate | Stat (%) | `5xx rate / total rate * 100` |
| 2 | HTTP Request Rate by Path | Timeseries | `sum(rate(avika_http_requests_total[2m])) by (path, method)` |
| 2 | HTTP Latency p50 / p95 / p99 | Timeseries | `histogram_quantile(0.{50,95,99}, ...)` by path |
| 3 | HTTP Status Codes | Timeseries | `sum(rate(...)) by (status)` |
| 3 | Memory — Alloc vs Sys | Timeseries | alloc + sys bytes |
| 4 | Goroutines Over Time | Timeseries | `nginx_gateway_goroutines` |
| 4 | Agent Fleet Status | Timeseries | online + offline gauges |
| 5 | DB Operations & Latency | Timeseries | ops/s + avg ms |
| 5 | GC Pause Time | Timeseries | GC pause ms/s |

### Exemplar-Linked Histogram

The **HTTP Latency p50/p95/p99** timeseries panel is configured with exemplars enabled. Points on the histogram that carry a `traceID` exemplar appear as diamonds. Clicking a diamond opens the Tempo trace for that exact request — the complete span tree, DB queries, and gRPC calls that made up that response time.

---

## 8. End-to-End Data Flow

<svg viewBox="0 0 940 460" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Avika End-to-End Observability Data Flow">
  <defs>
    <!-- Arrowheads -->
    <marker id="arrowB8" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#3B82F6"/>
    </marker>
    <marker id="arrowG8" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#10B981"/>
    </marker>
    <marker id="arrowY8" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F59E0B"/>
    </marker>
    <marker id="arrowO8" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#F97316"/>
    </marker>
    <marker id="arrowP8" markerWidth="6" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#8B5CF6"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="940" height="460" fill="#F8FAFC" rx="8"/>

  <!-- Title -->
  <text x="470" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#1E293B">Avika — End-to-End Observability Data Flow</text>

  <!-- Column headers -->
  <text x="120" y="54" text-anchor="middle" font-size="12" font-weight="600" fill="#6B7280">Sources</text>
  <text x="470" y="54" text-anchor="middle" font-size="12" font-weight="600" fill="#6B7280">Collection Layer</text>
  <text x="800" y="54" text-anchor="middle" font-size="12" font-weight="600" fill="#6B7280">Storage &amp; Visualization</text>

  <!-- Column separator lines -->
  <line x1="275" y1="44" x2="275" y2="430" stroke="#E2E8F0" stroke-width="1"/>
  <line x1="660" y1="44" x2="660" y2="430" stroke="#E2E8F0" stroke-width="1"/>

  <!-- ===== LEFT COLUMN: Sources ===== -->
  <!-- Gateway -->
  <rect x="30" y="80" width="160" height="50" rx="8" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
  <text x="110" y="101" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Avika Gateway</text>
  <text x="110" y="118" text-anchor="middle" font-size="10" fill="#94A3B8">Go · :5021 HTTP · :5020 gRPC</text>

  <!-- Frontend -->
  <rect x="30" y="165" width="160" height="50" rx="8" fill="#1E293B" stroke="#10B981" stroke-width="2"/>
  <text x="110" y="186" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Frontend</text>
  <text x="110" y="203" text-anchor="middle" font-size="10" fill="#94A3B8">Next.js · :5031</text>

  <!-- NGINX Agent -->
  <rect x="30" y="250" width="160" height="50" rx="8" fill="#1E293B" stroke="#8B5CF6" stroke-width="2"/>
  <text x="110" y="271" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">NGINX Agent</text>
  <text x="110" y="288" text-anchor="middle" font-size="10" fill="#94A3B8">Go · gRPC :5025</text>

  <!-- PostgreSQL -->
  <rect x="30" y="335" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="110" y="356" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">PostgreSQL</text>
  <text x="110" y="373" text-anchor="middle" font-size="10" fill="#94A3B8">DB spans via db.tracer</text>

  <!-- ===== MIDDLE COLUMN: Collection ===== -->
  <!-- OTEL Collector -->
  <rect x="310" y="80" width="160" height="64" rx="8" fill="#1E293B" stroke="#8B5CF6" stroke-width="2"/>
  <text x="390" y="103" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">OTEL Collector</text>
  <text x="390" y="120" text-anchor="middle" font-size="10" fill="#94A3B8">Contrib :4317 gRPC</text>
  <text x="390" y="135" text-anchor="middle" font-size="9" fill="#8B5CF6">Tail Sampling · k8sattributes</text>

  <!-- Prometheus -->
  <rect x="310" y="185" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="390" y="206" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Prometheus</text>
  <text x="390" y="223" text-anchor="middle" font-size="10" fill="#94A3B8">Scrapes :5022/metrics (15s)</text>

  <!-- Promtail -->
  <rect x="310" y="270" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="390" y="291" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Promtail</text>
  <text x="390" y="308" text-anchor="middle" font-size="10" fill="#94A3B8">DaemonSet · tails pod logs</text>

  <!-- Alertmanager -->
  <rect x="310" y="355" width="160" height="50" rx="8" fill="#1E293B" stroke="#EF4444" stroke-width="2"/>
  <text x="390" y="376" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Alertmanager</text>
  <text x="390" y="393" text-anchor="middle" font-size="10" fill="#94A3B8">Routes · Dedup · Silence</text>

  <!-- ===== RIGHT COLUMN: Storage & Viz ===== -->
  <!-- Grafana Tempo -->
  <rect x="695" y="80" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="775" y="101" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Grafana Tempo</text>
  <text x="775" y="118" text-anchor="middle" font-size="10" fill="#94A3B8">Trace Storage · avika ns</text>

  <!-- Prometheus TSDB -->
  <rect x="695" y="165" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="775" y="186" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Prometheus TSDB</text>
  <text x="775" y="203" text-anchor="middle" font-size="10" fill="#94A3B8">Metrics storage · 15d ret.</text>

  <!-- Loki -->
  <rect x="695" y="250" width="160" height="50" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="775" y="271" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Loki</text>
  <text x="775" y="288" text-anchor="middle" font-size="10" fill="#94A3B8">Log aggregation</text>

  <!-- Grafana (unified) -->
  <rect x="695" y="335" width="160" height="64" rx="8" fill="#1E293B" stroke="#F97316" stroke-width="2"/>
  <text x="775" y="358" text-anchor="middle" font-size="12" font-weight="600" fill="#F8FAFC">Grafana</text>
  <text x="775" y="375" text-anchor="middle" font-size="10" fill="#94A3B8">Dashboards · Explore</text>
  <text x="775" y="390" text-anchor="middle" font-size="9" fill="#F97316">Metrics · Traces · Logs</text>

  <!-- ===== ARROWS: Sources → Collection ===== -->
  <!-- Gateway → OTEL (traces, OTLP) -->
  <line x1="190" y1="100" x2="304" y2="100" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowB8)"/>
  <!-- Gateway → Prometheus (metrics scrape - reverse direction) -->
  <polyline points="390,185 390,174 190,174 190,174" stroke="#10B981" stroke-width="2" fill="none" marker-end="url(#arrowG8)"/>
  <!-- Gateway → Promtail (logs via stdout) -->
  <polyline points="190,120 220,120 220,295 304,295" stroke="#F59E0B" stroke-width="1.5" fill="none" marker-end="url(#arrowY8)"/>
  <!-- Agent → OTEL (traces) -->
  <polyline points="190,265 245,265 245,118 304,118" stroke="#8B5CF6" stroke-width="1.5" fill="none" marker-end="url(#arrowP8)"/>
  <!-- PostgreSQL → OTEL (DB spans via context) -->
  <polyline points="190,355 250,355 250,138 304,138" stroke="#8B5CF6" stroke-width="1" fill="none" stroke-dasharray="4,3" marker-end="url(#arrowP8)"/>

  <!-- ===== ARROWS: Collection → Storage ===== -->
  <!-- OTEL → Tempo -->
  <line x1="470" y1="110" x2="689" y2="110" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowB8)"/>
  <!-- Prometheus → TSDB -->
  <line x1="470" y1="210" x2="689" y2="210" stroke="#10B981" stroke-width="2" marker-end="url(#arrowG8)"/>
  <!-- Promtail → Loki -->
  <line x1="470" y1="295" x2="689" y2="295" stroke="#F59E0B" stroke-width="2" marker-end="url(#arrowY8)"/>
  <!-- Alertmanager (Prometheus feeds it) -->
  <polyline points="470,210 530,210 530,380 304,380" stroke="#EF4444" stroke-width="1.5" fill="none" marker-end="url(#arrowB8)"/>

  <!-- ===== ARROWS: Storage → Grafana ===== -->
  <!-- Tempo → Grafana -->
  <polyline points="775,130 775,155 850,155 850,367 855,367" stroke="#F97316" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrowO8)"/>
  <!-- TSDB → Grafana -->
  <polyline points="775,215 775,250 855,250 855,367" stroke="#F97316" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrowO8)"/>
  <!-- Loki → Grafana -->
  <polyline points="775,300 775,340 855,340 855,367" stroke="#F97316" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrowO8)"/>

  <!-- ===== ANIMATED DOTS ===== -->
  <!-- Blue: traces Gateway → OTEL → Tempo -->
  <circle r="5" fill="#3B82F6" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="0s">
      <mpath><path d="M 190,100 L 304,100"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#3B82F6" opacity="0.9">
    <animateMotion dur="3s" repeatCount="indefinite" begin="1.5s">
      <mpath><path d="M 470,110 L 689,110"/></mpath>
    </animateMotion>
  </circle>

  <!-- Green: metrics scrape Gateway → Prometheus → TSDB -->
  <circle r="5" fill="#10B981" opacity="0.9">
    <animateMotion dur="3.5s" repeatCount="indefinite" begin="0.5s">
      <mpath><path d="M 390,185 L 390,174 L 190,174"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#10B981" opacity="0.9">
    <animateMotion dur="3.5s" repeatCount="indefinite" begin="2s">
      <mpath><path d="M 470,210 L 689,210"/></mpath>
    </animateMotion>
  </circle>

  <!-- Yellow: logs stdout → Promtail → Loki -->
  <circle r="5" fill="#F59E0B" opacity="0.9">
    <animateMotion dur="4s" repeatCount="indefinite" begin="1s">
      <mpath><path d="M 190,120 L 220,120 L 220,295 L 304,295"/></mpath>
    </animateMotion>
  </circle>
  <circle r="5" fill="#F59E0B" opacity="0.9">
    <animateMotion dur="4s" repeatCount="indefinite" begin="2.5s">
      <mpath><path d="M 470,295 L 689,295"/></mpath>
    </animateMotion>
  </circle>

  <!-- Purple: Agent traces → OTEL -->
  <circle r="5" fill="#8B5CF6" opacity="0.8">
    <animateMotion dur="3.5s" repeatCount="indefinite" begin="0.8s">
      <mpath><path d="M 190,265 L 245,265 L 245,118 L 304,118"/></mpath>
    </animateMotion>
  </circle>

  <!-- Legend -->
  <rect x="30" y="418" width="12" height="12" fill="#3B82F6" rx="2"/>
  <text x="48" y="429" font-size="11" fill="#4B5563">Traces (OTLP)</text>
  <rect x="160" y="418" width="12" height="12" fill="#10B981" rx="2"/>
  <text x="178" y="429" font-size="11" fill="#4B5563">Metrics (scrape)</text>
  <rect x="300" y="418" width="12" height="12" fill="#F59E0B" rx="2"/>
  <text x="318" y="429" font-size="11" fill="#4B5563">Logs (stdout)</text>
  <rect x="420" y="418" width="12" height="12" fill="#8B5CF6" rx="2"/>
  <text x="438" y="429" font-size="11" fill="#4B5563">Agent Spans</text>
  <rect x="540" y="418" width="12" height="12" fill="#F97316" rx="2"/>
  <text x="558" y="429" font-size="11" fill="#4B5563">Grafana (unified query)</text>
</svg>

### Signal Correlation

All three signals are correlated through `trace_id`:

| From | To | Mechanism |
|------|----|-----------|
| Log line | Tempo trace | Grafana Derived Field on `trace_id` JSON field |
| Prometheus histogram | Tempo trace | Exemplar `traceID` label on histogram observation |
| Alertmanager alert | Grafana dashboard | `runbook_url` annotation + dashboard link |

---

## 9. Deployment Modes

Avika ships observability wiring for all three deployment modes. The instrumentation code is identical across modes — only the endpoint addresses and delivery mechanisms differ.

| Component | Kubernetes | Docker Compose | Standalone |
|-----------|-----------|----------------|------------|
| **Metrics scrape** | `ServiceMonitor` CR (avika namespace) discovers `:5022/metrics` every 15s | Compose Prometheus with `static_configs` targeting `gateway:5022` | Prometheus `static_configs` → `localhost:5022` |
| **Trace export** | OTLP/gRPC → `otel-gateway.monitoring.svc.cluster.local:4317` | OTLP/gRPC → `otel-collector:4317` (compose service) | OTLP/gRPC → `localhost:4317` (local collector) |
| **Log shipping** | Promtail DaemonSet tails pod logs, labels `{app="avika", namespace="avika"}` | Loki Docker log driver or Promtail sidecar container | Promtail binary reading journald / `/var/log/avika/` |
| **Trace storage** | Grafana Tempo (`avika-tempo.monitoring.svc.cluster.local:4317`) | Grafana Tempo container in compose stack | Grafana Tempo binary on localhost |
| **Alert rules** | `PrometheusRule` CR in avika namespace | `rules.yml` mounted into Prometheus container | `rules.yml` in Prometheus config directory |
| **Dashboards** | Grafana ConfigMap (`grafana_dashboard: "1"` label) | Grafana provisioning volume mount | Grafana provisioning directory |
| **Health probes** | `livenessProbe` + `readinessProbe` on k8s containers | Docker `healthcheck` in `docker-compose.yaml` | Systemd `ExecStartPost` or external probe |

### Environment Variable Control

The OTLP endpoint is configured via `OTEL_EXPORTER_OTLP_ENDPOINT`. Set to `disabled` to suppress tracing in unit tests or local dev without instrumentation:

```bash
# Kubernetes (ConfigMap or SealedSecret)
OTEL_EXPORTER_OTLP_ENDPOINT=otel-gateway.monitoring.svc.cluster.local:4317

# Docker Compose
OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317

# Standalone
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317

# Disabled (unit tests)
OTEL_EXPORTER_OTLP_ENDPOINT=disabled
```

### OTel Collector — Compose vs k8s

The Docker Compose collector config (`deploy/docker/otel-collector-config.yaml`) routes to Redpanda for async buffering. The k8s collector config (`deploy/k8s/otel-collector-config.yaml`) routes directly to Tempo with tail sampling. Both accept OTLP on `:4317` and `:4318` — the gateway code is identical.

---

## 10. Instrumentation Checklist

Use this checklist before declaring any new Avika service or component production-ready.

```
## Observability Readiness — Pre-Deploy Checklist

### Metrics
- [ ] /metrics endpoint responds with Prometheus text format on the metrics port
- [ ] ServiceMonitor deployed in app namespace with label release: monitoring
- [ ] ServiceMonitor selector matches app Service labels exactly
- [ ] At minimum: request_total counter + request_duration_seconds histogram
- [ ] Histogram has Exemplar support (ObserveWithExemplar) if span context available
- [ ] Route-pattern labels used (not raw URL path) to control cardinality
- [ ] nginx_gateway_info (or equivalent) gauge present as liveness indicator

### Tracing
- [ ] initTracer() called at startup, shutdown func deferred on graceful exit
- [ ] OTEL_EXPORTER_OTLP_ENDPOINT env var respected (supports "disabled")
- [ ] All HTTP handlers wrapped: otelhttp.NewHandler(handler, "service-name")
- [ ] gRPC server has: grpc.StatsHandler(otelgrpc.NewServerHandler())
- [ ] All outbound gRPC clients have: grpc.WithStatsHandler(otelgrpc.NewClientHandler())
- [ ] All PostgreSQL operations use db.dbSpan(ctx, op, table) — ctx propagated through
- [ ] W3C TraceContext + Baggage propagator set on otel.SetTextMapPropagator
- [ ] service.name, service.version, deployment.environment in OTel resource

### Logging
- [ ] JSON structured logs with: level, time, service, version fields always present
- [ ] trace_id and span_id extracted from OTel span context and added to every request log
- [ ] Log level controlled via LOG_LEVEL env var (debug/info/warn/error)
- [ ] No sensitive data in log fields (passwords, tokens, PII)
- [ ] Loki labels defined: {app="avika", namespace="avika", component="<component>"}

### Alerting
- [ ] PrometheusRule deployed in app namespace (not monitoring namespace)
- [ ] PrometheusRule has label release: monitoring (required by kube-prometheus-stack selector)
- [ ] Watchdog alert present (vector(1), always firing — dead man's switch)
- [ ] Service-down alert: absent(gateway_info) for 2m, severity: critical
- [ ] Error-rate alert: 5xx > 5% for 5m, severity: warning
- [ ] Latency p95 alert: > 2s for 5m, severity: warning
- [ ] All alerts have summary and description annotations
- [ ] runbook_url annotation points to relevant section in this document

### Dashboards
- [ ] Grafana dashboard ConfigMap in app namespace with label grafana_dashboard: "1"
- [ ] Dashboard uid is unique across all dashboards (check existing UIDs)
- [ ] Dashboard covers RED method: Rate, Errors, Duration
- [ ] Saturation panel: goroutines or queue depth
- [ ] At least one histogram panel has exemplars enabled (→ Tempo link)
- [ ] Every panel has a description (hover → explain what is shown)
- [ ] Dashboard has a description field explaining what service it covers

### Health
- [ ] /healthz endpoint returns 200 OK when service is healthy
- [ ] k8s livenessProbe configured (httpGet /healthz, initialDelaySeconds ≥ 5)
- [ ] k8s readinessProbe configured (httpGet /healthz, faster period than liveness)
- [ ] /metrics endpoint is NOT behind authentication (Prometheus cannot auth)
- [ ] /healthz endpoint is NOT behind authentication

### Documentation
- [ ] docs/OBSERVABILITY_ARCHITECTURE.md updated to reflect new service
- [ ] runbook_url annotations in PrometheusRule point to valid anchors
- [ ] Grafana dashboard panels have description text
- [ ] Port assignments added to internal/common/ports/ports.go
```

---

## Reference: Key File Locations

| File | Purpose |
|------|---------|
| `deploy/k8s/avika-observability.yaml` | ServiceMonitor, PrometheusRule, Grafana dashboard ConfigMap |
| `deploy/k8s/otel-collector-config.yaml` | OTel Collector deployment + tail sampling config (k8s) |
| `deploy/docker/otel-collector-config.yaml` | OTel Collector config for Docker Compose mode |
| `cmd/gateway/tracer.go` | OTel SDK initialization, OTLP exporter, resource attributes |
| `cmd/gateway/httpprom.go` | HTTP metrics middleware + exemplar attachment |
| `cmd/gateway/database.go` | `dbSpan()` helper — PostgreSQL OTel spans |
| `cmd/gateway/main.go:2359` | `otelhttp.NewHandler` wrapping all HTTP routes |
| `cmd/gateway/main.go:1448` | `otelgrpc.NewServerHandler` on gRPC server |
| `internal/common/logging/logger.go` | zerolog setup, `LogHTTPRequest`, `LogGRPCRequest` |
| `internal/common/ports/ports.go` | Canonical port assignments (5020–5031) |

---

*Last updated: 2026-06-08 — reflects Phase 3 observability (database spans, gRPC tracing, exemplars, tail sampling).*
