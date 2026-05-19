# Avika Observability — How We Wired Metrics, Traces & Alerts into a Running K8s Cluster

> **Tags:** opentelemetry · kubernetes · grafana · prometheus · distributed-tracing · go · nginx

This post documents exactly what we built, why we built it that way, and what you can see in Grafana after it's live. Everything below is production code — not a tutorial skeleton.

---

## The Problem

Avika is a self-hosted NGINX fleet management platform. It has a Go gateway, a Next.js frontend, PostgreSQL, ClickHouse, and a gRPC agent protocol. When something breaks in production:

- A user reports "agents aren't showing" — is it the gateway? The DB? The frontend?
- An API endpoint gets slow — which query? Which handler?
- Memory climbs over 6 hours — where's the leak?

Without observability, the answer is always "read the logs and hope". With 10,000+ lines of Go, that's not sustainable.

---

## What We Had Before

| Component | State |
|-----------|-------|
| kube-prometheus-stack | Running (Prometheus + Grafana + Alertmanager) |
| OTel Collector (`otel-gateway`) | Running but **no pipeline config** — an empty shell |
| Avika `/metrics` endpoint | Serving 50 real metrics — **not scraped by Prometheus** |
| Frontend | Zero telemetry libraries |
| Gateway | OTel listed as indirect dep — not used |

The biggest gap: everything existed, nothing was wired.

---

## Architecture Diagram

<!-- BLOG_SVG_START -->
<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Avika Observability Architecture">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0B0F19;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
    </linearGradient>

    <!-- Card gradient -->
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1F2937;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
    </linearGradient>

    <!-- Arrow markers -->
    <marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#3B82F6"/>
    </marker>
    <marker id="arrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#4ADE80"/>
    </marker>
    <marker id="arrowOrange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#FCD34D"/>
    </marker>
    <marker id="arrowPurple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#A78BFA"/>
    </marker>

    <!-- Pulse animation keyframes -->
    <style>
      @keyframes pulse-blue {
        0%, 100% { opacity: 0.2; r: 4; }
        50% { opacity: 1; r: 6; }
      }
      @keyframes pulse-green {
        0%, 100% { opacity: 0.2; r: 4; }
        50% { opacity: 1; r: 6; }
      }
      @keyframes dash-flow-blue {
        to { stroke-dashoffset: -30; }
      }
      @keyframes dash-flow-green {
        to { stroke-dashoffset: -30; }
      }
      @keyframes dash-flow-orange {
        to { stroke-dashoffset: -30; }
      }
      @keyframes dash-flow-purple {
        to { stroke-dashoffset: -30; }
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes glow {
        0%, 100% { filter: drop-shadow(0 0 4px rgba(59,130,246,0.3)); }
        50% { filter: drop-shadow(0 0 12px rgba(59,130,246,0.8)); }
      }
      @keyframes glow-green {
        0%, 100% { filter: drop-shadow(0 0 4px rgba(74,222,128,0.3)); }
        50% { filter: drop-shadow(0 0 12px rgba(74,222,128,0.7)); }
      }
      @keyframes spin-slow {
        from { transform: rotate(0deg); transform-origin: center; }
        to { transform: rotate(360deg); transform-origin: center; }
      }
      .flow-blue {
        stroke-dasharray: 8 6;
        animation: dash-flow-blue 0.8s linear infinite;
      }
      .flow-green {
        stroke-dasharray: 8 6;
        animation: dash-flow-green 1.0s linear infinite;
      }
      .flow-orange {
        stroke-dasharray: 8 6;
        animation: dash-flow-orange 1.2s linear infinite;
      }
      .flow-purple {
        stroke-dasharray: 8 6;
        animation: dash-flow-purple 1.4s linear infinite;
      }
      .dot-blue {
        animation: pulse-blue 2s ease-in-out infinite;
        fill: #3B82F6;
      }
      .dot-green {
        animation: pulse-green 2s ease-in-out 0.5s infinite;
        fill: #4ADE80;
      }
      .card-glow {
        animation: glow 3s ease-in-out infinite;
      }
      .card-glow-green {
        animation: glow-green 3s ease-in-out 1s infinite;
      }
      .label-fade {
        animation: fade-in 0.6s ease-out forwards;
      }
    </style>

    <!-- Drop shadow filter -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    <filter id="shadowBlue">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#3B82F6" flood-opacity="0.5"/>
    </filter>
    <filter id="shadowGreen">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#4ADE80" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="900" height="560" fill="url(#bgGrad)" rx="12"/>

  <!-- Title -->
  <text x="450" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#F9FAFB" letter-spacing="0.5">Avika Observability Architecture</text>
  <text x="450" y="54" text-anchor="middle" font-size="11" fill="#CBD5E1">Metrics → Prometheus · Traces → Tempo · Alerts → Alertmanager</text>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- ROW 1: Avika components (left side) -->
  <!-- ═══════════════════════════════════════════════════════════ -->

  <!-- GATEWAY BOX -->
  <g class="card-glow" filter="url(#shadowBlue)">
    <rect x="30" y="80" width="180" height="120" rx="10" fill="url(#cardGrad)" stroke="#3B82F6" stroke-width="1.5"/>
  </g>
  <text x="120" y="104" text-anchor="middle" font-size="11" font-weight="700" fill="#F9FAFB">Avika Gateway</text>
  <text x="120" y="118" text-anchor="middle" font-size="9" fill="#CBD5E1">Go · v1.119.0</text>
  <!-- Layers inside gateway -->
  <rect x="46" y="128" width="148" height="18" rx="4" fill="#1E3A5F" stroke="#3B82F6" stroke-width="0.8"/>
  <text x="120" y="141" text-anchor="middle" font-size="9" fill="#93C5FD">otelhttp middleware</text>
  <rect x="46" y="150" width="148" height="18" rx="4" fill="#052E16" stroke="#4ADE80" stroke-width="0.8"/>
  <text x="120" y="163" text-anchor="middle" font-size="9" fill="#86EFAC">Prometheus /metrics</text>
  <rect x="46" y="172" width="148" height="18" rx="4" fill="#1F2937" stroke="#374151" stroke-width="0.8"/>
  <text x="120" y="185" text-anchor="middle" font-size="9" fill="#CBD5E1">zerolog structured logs</text>

  <!-- AGENTS BOX -->
  <rect x="30" y="230" width="180" height="70" rx="10" fill="url(#cardGrad)" stroke="#374151" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="120" y="254" text-anchor="middle" font-size="11" font-weight="700" fill="#F9FAFB">NGINX Agents</text>
  <text x="120" y="270" text-anchor="middle" font-size="9" fill="#CBD5E1">gRPC heartbeat</text>
  <text x="120" y="284" text-anchor="middle" font-size="9" fill="#CBD5E1">access log stream</text>

  <!-- FRONTEND BOX -->
  <rect x="30" y="330" width="180" height="70" rx="10" fill="url(#cardGrad)" stroke="#374151" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="120" y="354" text-anchor="middle" font-size="11" font-weight="700" fill="#F9FAFB">Next.js Frontend</text>
  <text x="120" y="370" text-anchor="middle" font-size="9" fill="#CBD5E1">/avika/api/metrics</text>
  <text x="120" y="384" text-anchor="middle" font-size="9" fill="#6B7280">OTel JS — Phase 3</text>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- CENTER: OTel Collector -->
  <!-- ═══════════════════════════════════════════════════════════ -->
  <g class="card-glow">
    <rect x="350" y="110" width="200" height="180" rx="10" fill="url(#cardGrad)" stroke="#F59E0B" stroke-width="1.5" filter="url(#shadow)"/>
  </g>
  <text x="450" y="136" text-anchor="middle" font-size="12" font-weight="700" fill="#F9FAFB">OTel Collector</text>
  <text x="450" y="150" text-anchor="middle" font-size="9" fill="#CBD5E1">otel-gateway · monitoring ns</text>
  <!-- Pipeline boxes -->
  <rect x="366" y="160" width="168" height="28" rx="5" fill="#1F2937" stroke="#3B82F6" stroke-width="1"/>
  <text x="450" y="172" text-anchor="middle" font-size="9" font-weight="600" fill="#93C5FD">TRACES pipeline</text>
  <text x="450" y="183" text-anchor="middle" font-size="8" fill="#CBD5E1">otlp → batch → Tempo</text>

  <rect x="366" y="196" width="168" height="28" rx="5" fill="#1F2937" stroke="#4ADE80" stroke-width="1"/>
  <text x="450" y="208" text-anchor="middle" font-size="9" font-weight="600" fill="#86EFAC">METRICS pipeline</text>
  <text x="450" y="219" text-anchor="middle" font-size="8" fill="#CBD5E1">otlp → batch → Prometheus</text>

  <rect x="366" y="232" width="168" height="28" rx="5" fill="#1F2937" stroke="#6B7280" stroke-width="1"/>
  <text x="450" y="244" text-anchor="middle" font-size="9" font-weight="600" fill="#9CA3AF">LOGS pipeline</text>
  <text x="450" y="255" text-anchor="middle" font-size="8" fill="#6B7280">Phase 3 (Loki)</text>

  <text x="450" y="280" text-anchor="middle" font-size="8" fill="#6B7280">Ports: 4317 gRPC · 4318 HTTP</text>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- RIGHT: Storage backends -->
  <!-- ═══════════════════════════════════════════════════════════ -->

  <!-- PROMETHEUS -->
  <g class="card-glow-green">
    <rect x="660" y="80" width="210" height="80" rx="10" fill="url(#cardGrad)" stroke="#E57153" stroke-width="1.5" filter="url(#shadow)"/>
  </g>
  <text x="765" y="104" text-anchor="middle" font-size="12" font-weight="700" fill="#F9FAFB">Prometheus</text>
  <text x="765" y="118" text-anchor="middle" font-size="9" fill="#CBD5E1">kube-prometheus-stack</text>
  <text x="765" y="132" text-anchor="middle" font-size="9" fill="#CBD5E1">ServiceMonitor → /metrics scrape</text>
  <text x="765" y="146" text-anchor="middle" font-size="9" fill="#CBD5E1">50+ nginx_gateway_* metrics</text>

  <!-- TEMPO -->
  <rect x="660" y="185" width="210" height="80" rx="10" fill="url(#cardGrad)" stroke="#A78BFA" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="765" y="209" text-anchor="middle" font-size="12" font-weight="700" fill="#F9FAFB">Grafana Tempo</text>
  <text x="765" y="223" text-anchor="middle" font-size="9" fill="#CBD5E1">v2.4.1 · avika-tempo</text>
  <text x="765" y="237" text-anchor="middle" font-size="9" fill="#CBD5E1">Distributed trace storage</text>
  <text x="765" y="251" text-anchor="middle" font-size="9" fill="#CBD5E1">48h retention · local fs</text>

  <!-- ALERTMANAGER -->
  <rect x="660" y="290" width="210" height="60" rx="10" fill="url(#cardGrad)" stroke="#F87171" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="765" y="314" text-anchor="middle" font-size="12" font-weight="700" fill="#F9FAFB">Alertmanager</text>
  <text x="765" y="330" text-anchor="middle" font-size="9" fill="#CBD5E1">8 PrometheusRule alerts</text>
  <text x="765" y="344" text-anchor="middle" font-size="9" fill="#CBD5E1">Slack · email · PagerDuty</text>

  <!-- GRAFANA -->
  <rect x="660" y="375" width="210" height="80" rx="10" fill="url(#cardGrad)" stroke="#F59E0B" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="765" y="399" text-anchor="middle" font-size="12" font-weight="700" fill="#F9FAFB">Grafana</text>
  <text x="765" y="413" text-anchor="middle" font-size="9" fill="#CBD5E1">kube-prometheus-stack</text>
  <text x="765" y="427" text-anchor="middle" font-size="9" fill="#CBD5E1">Datasources: Prometheus + Tempo</text>
  <text x="765" y="441" text-anchor="middle" font-size="9" fill="#CBD5E1">Dashboard: avika-gateway-overview</text>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- ANIMATED FLOW ARROWS -->
  <!-- ═══════════════════════════════════════════════════════════ -->

  <!-- Gateway → OTel Collector (OTLP gRPC traces, blue) -->
  <line x1="210" y1="137" x2="348" y2="175" stroke="#3B82F6" stroke-width="2" class="flow-blue" marker-end="url(#arrowBlue)"/>
  <text x="275" y="148" text-anchor="middle" font-size="8" fill="#93C5FD" transform="rotate(-12, 275, 148)">OTLP gRPC :4317</text>

  <!-- Gateway → Prometheus (direct scrape, green) -->
  <path d="M 210 162 Q 430 162 658 120" stroke="#4ADE80" stroke-width="1.5" fill="none" class="flow-green" marker-end="url(#arrowGreen)"/>
  <text x="435" y="150" text-anchor="middle" font-size="8" fill="#86EFAC">ServiceMonitor /metrics scrape</text>

  <!-- Agents → Gateway (gRPC) -->
  <line x1="210" y1="265" x2="30" y2="185" stroke="#6B7280" stroke-width="1.5" class="flow-orange" marker-end="url(#arrowOrange)" stroke-dasharray="6 4"/>
  <text x="145" y="222" text-anchor="middle" font-size="8" fill="#9CA3AF" transform="rotate(-40, 145, 222)">gRPC stream</text>

  <!-- Frontend → Prometheus (metrics, lighter green) -->
  <path d="M 210 365 Q 435 390 658 320" stroke="#4ADE80" stroke-width="1" fill="none" class="flow-green" stroke-dasharray="5 5" marker-end="url(#arrowGreen)" opacity="0.6"/>
  <text x="430" y="395" text-anchor="middle" font-size="8" fill="#86EFAC" opacity="0.7">SM /avika/api/metrics</text>

  <!-- OTel Collector → Tempo (traces, purple) -->
  <line x1="550" y1="200" x2="658" y2="220" stroke="#A78BFA" stroke-width="2" class="flow-purple" marker-end="url(#arrowPurple)"/>
  <text x="604" y="205" text-anchor="middle" font-size="8" fill="#C4B5FD">OTLP → Tempo</text>

  <!-- OTel Collector → Prometheus (metrics push, green) -->
  <line x1="550" y1="210" x2="658" y2="155" stroke="#4ADE80" stroke-width="1.5" class="flow-green" marker-end="url(#arrowGreen)" stroke-dasharray="6 4"/>
  <text x="604" y="178" text-anchor="middle" font-size="8" fill="#86EFAC" opacity="0.8">metrics</text>

  <!-- Prometheus → Alertmanager -->
  <line x1="765" y1="160" x2="765" y2="288" stroke="#F87171" stroke-width="1.5" class="flow-orange" marker-end="url(#arrowOrange)" stroke-dasharray="5 4"/>
  <text x="785" y="225" font-size="8" fill="#FCA5A5">alerts</text>

  <!-- Prometheus → Grafana -->
  <line x1="730" y1="360" x2="730" y2="373" stroke="#F59E0B" stroke-width="1.5" class="flow-orange" marker-end="url(#arrowOrange)"/>

  <!-- Tempo → Grafana -->
  <line x1="765" y1="265" x2="765" y2="373" stroke="#A78BFA" stroke-width="1.5" class="flow-purple" marker-end="url(#arrowPurple)"/>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- ANIMATED DOTS ON FLOW LINES (signal packets) -->
  <!-- ═══════════════════════════════════════════════════════════ -->

  <!-- Dot: Gateway → OTel (trace packet) -->
  <circle r="4" fill="#3B82F6" opacity="0.9">
    <animateMotion dur="1.6s" repeatCount="indefinite" begin="0s">
      <mpath>
        <path d="M 210 137 L 348 175"/>
      </mpath>
    </animateMotion>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.6s" repeatCount="indefinite"/>
  </circle>

  <!-- Dot: Gateway → Prometheus (metrics) -->
  <circle r="3.5" fill="#4ADE80" opacity="0.9">
    <animateMotion dur="2.4s" repeatCount="indefinite" begin="0.4s">
      <mpath href="#metricsPath"/>
    </animateMotion>
    <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite" begin="0.4s"/>
  </circle>
  <path id="metricsPath" d="M 210 162 Q 430 162 658 120" fill="none"/>

  <!-- Dot: OTel → Tempo -->
  <circle r="4" fill="#A78BFA" opacity="0.9">
    <animateMotion dur="1.2s" repeatCount="indefinite" begin="0.8s">
      <mpath>
        <path d="M 550 200 L 658 220"/>
      </mpath>
    </animateMotion>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite" begin="0.8s"/>
  </circle>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- LEGEND -->
  <!-- ═══════════════════════════════════════════════════════════ -->
  <rect x="30" y="460" width="840" height="80" rx="8" fill="#1F2937" stroke="#374151" stroke-width="1"/>
  <text x="450" y="480" text-anchor="middle" font-size="10" font-weight="600" fill="#F9FAFB">What you can now debug in Grafana</text>

  <!-- Legend items -->
  <rect x="50" y="492" width="10" height="10" rx="2" fill="#3B82F6"/>
  <text x="66" y="502" font-size="9" fill="#CBD5E1">Slow endpoint → Tempo trace waterfall</text>

  <rect x="240" y="492" width="10" height="10" rx="2" fill="#4ADE80"/>
  <text x="256" y="502" font-size="9" fill="#CBD5E1">Error spike → avika_http_requests_total{status="5.."}</text>

  <rect x="480" y="492" width="10" height="10" rx="2" fill="#F87171"/>
  <text x="496" y="502" font-size="9" fill="#CBD5E1">Alert fired → Alertmanager → Slack</text>

  <rect x="50" y="516" width="10" height="10" rx="2" fill="#A78BFA"/>
  <text x="66" y="526" font-size="9" fill="#CBD5E1">Memory leak → nginx_gateway_memory_alloc_bytes chart</text>

  <rect x="240" y="516" width="10" height="10" rx="2" fill="#FCD34D"/>
  <text x="256" y="526" font-size="9" fill="#CBD5E1">Agent drop → nginx_gateway_agents_total{status="online"}</text>

  <rect x="480" y="516" width="10" height="10" rx="2" fill="#9CA3AF"/>
  <text x="496" y="526" font-size="9" fill="#CBD5E1">Goroutine leak → nginx_gateway_goroutines > 1000 alert</text>

  <!-- Version stamp -->
  <text x="870" y="554" text-anchor="end" font-size="8" fill="#374151">avika v1.119.0</text>
</svg>
<!-- BLOG_SVG_END -->

---

## Phase 1 — Wire Prometheus (Zero Code Changes)

### Problem
Avika's gateway already exposed `/metrics` with 50 Prometheus metrics. Prometheus was running in the cluster. They had never met.

### Fix: ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: avika-gateway
  namespace: avika
spec:
  selector:
    matchLabels:
      component: gateway
  endpoints:
    - port: http          # gateway serves /metrics on port 5021 (HTTP), not the named 'metrics' port
      path: /metrics
      interval: 15s
```

Two gotchas hit us:
1. The Helm chart defined a named `metrics` port (5022) but the gateway never listened there — metrics live on the main HTTP port (5021). Wrong port = `connect: connection refused`.
2. `serviceMonitorSelector: {}` on the Prometheus CRD means it picks up ServiceMonitors from **all namespaces** automatically — no label matching needed.

### What Prometheus now scrapes every 15 seconds

| Metric | Type | Tells you |
|--------|------|-----------|
| `avika_http_request_duration_seconds` | Histogram | p50/p95/p99 latency per endpoint |
| `avika_http_requests_total` | Counter | Request rate and error rate by status |
| `nginx_gateway_agents_total` | Gauge | How many agents are online vs offline |
| `nginx_gateway_goroutines` | Gauge | Goroutine count (leaks spike this) |
| `nginx_gateway_memory_alloc_bytes` | Gauge | Heap allocation (leaks climb this) |
| `nginx_gateway_db_latency_avg_ms` | Gauge | Average PostgreSQL query time |
| `nginx_gateway_gc_pause_total_ns` | Counter | GC pause pressure |

### Grafana dashboard

The dashboard (`avika-gateway-overview`) is provisioned as a ConfigMap with label `grafana_dashboard: "1"` — Grafana's sidecar picks it up automatically, no manual import needed.

```
Grafana → Explore → Select dashboard "Avika — Gateway Overview"
```

---

## Phase 2 — Distributed Tracing (OTel Go SDK)

### Why metrics alone aren't enough

Prometheus tells you *that* `/api/agents` is taking 3 seconds. It cannot tell you *why*. Is it a slow DB query? A hung HTTP client call? An N+1 query in the handler? Distributed tracing answers this.

### Implementation: `tracer.go`

```go
func initTracer(serviceName, version string) (shutdown func(context.Context) error, err error) {
    endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint == "" {
        endpoint = "otel-gateway.monitoring.svc.cluster.local:4317"
    }

    conn, err := grpc.NewClient(endpoint,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    // Fails open: if collector is unreachable, tracing disabled silently.
    // The gateway still starts and serves requests — observability failure
    // must never take down the application.

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(0.10))), // 10% default
        sdktrace.WithBatcher(exporter, sdktrace.WithBatchTimeout(5*time.Second)),
        sdktrace.WithResource(res),
    )
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},  // W3C traceparent header
        propagation.Baggage{},
    ))
    otel.SetTracerProvider(tp)
}
```

**Key design decisions:**
- **Fails open** — if the OTel collector is unreachable, the gateway starts normally. Observability failure ≠ application failure.
- **10% sampling by default** — enough to catch patterns and outliers without 10× CPU overhead. Override with `OTEL_SAMPLE_RATE=1` for debugging.
- **W3C propagation** — if an upstream service passes a `traceparent` header, Avika continues the same trace. Future frontend traces will link end-to-end.

### Wiring in `main.go`

```go
// After alert engine starts, before HTTP server binds:
shutdownTracer, _ := initTracer("avika-gateway", Version)
defer func() {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    _ = shutdownTracer(ctx) // flush pending spans on SIGTERM
}()

// Wrap entire handler stack:
tracedHandler := otelhttp.NewHandler(handler, "avika-gateway",
    otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
        return r.Method + " " + r.URL.Path // "GET /api/agents"
    }),
)
```

Every HTTP request now gets a span with:
- `http.method`, `http.route`, `http.status_code`
- `net.peer.ip` (client IP)
- Duration of the full handler including middleware

### Grafana Tempo

Tempo is deployed as a single-binary with local storage (48-hour retention). It ingests OTLP traces from the OTel Collector.

```
Grafana → Explore → Tempo → Search
Service Name: avika-gateway
Duration: > 500ms    ← find slow requests
```

Click any trace → waterfall view showing:
- Total request time
- Time inside each middleware layer
- HTTP status, client IP, path

---

## Alert Rules

8 PrometheusRules deployed, routing through Alertmanager:

```
AvikaGatewayDown        → absent(nginx_gateway_info) for 2m     → CRITICAL
AvikaHighErrorRate      → 5xx > 5% for 5m                       → WARNING
AvikaHighLatency        → p95 > 2s for 5m (per path)            → WARNING
AvikaAllAgentsOffline   → online agents = 0 for 5m              → CRITICAL
AvikaAgentsDroppingOff  → >20% drop in 15m                      → WARNING
AvikaGatewayHighMemory  → >500MB alloc for 10m                  → WARNING
AvikaGoroutineLeak      → >1000 goroutines for 15m              → WARNING
AvikaSlowDatabase       → avg DB latency >200ms for 5m           → WARNING
```

---

## What's Next (Phase 3)

| Feature | What it adds |
|---------|-------------|
| **Loki log aggregation** | Ship zerolog JSON from all pods → searchable in Grafana |
| **Span-level DB tracing** | Child spans for each `db.QueryContext` → see which query is slow |
| **Frontend OTel JS** | Browser errors, API call failures, Core Web Vitals in Grafana |
| **Exemplars** | Link Prometheus histogram buckets directly to the Tempo trace of the slowest request |
| **gRPC tracing** | Add `otelgrpc` interceptors → see agent heartbeat spans |

---

## Debugging Playbook (with this setup)

**"Users report API is slow"**
1. Grafana → Avika Overview → HTTP Latency p95 by path → identify the endpoint
2. Grafana → Explore → Tempo → filter by that path + duration > 1s → click trace
3. Trace waterfall shows exactly where the time went

**"Gateway pod restarted unexpectedly"**
1. Grafana → Avika Overview → Goroutines over time → spike before restart?
2. Grafana → Avika Overview → Memory alloc → climbing leak?
3. Alertmanager → check which rule fired and when
4. (Phase 3) Loki → `{job="avika-gateway"} |= "panic"` → full stack trace

**"Agents not showing in inventory"**
1. Grafana → Agent Fleet panel → `nginx_gateway_agents_total{status="online"}` → confirm count
2. AvikaAllAgentsOffline alert → did it fire? When?
3. Tempo → traces to `/api/servers` → are requests succeeding?

---

## Deployment Summary

```bash
# Phase 1 & 2 applied to cluster:
kubectl apply -f deploy/k8s/avika-observability.yaml   # ServiceMonitors, PrometheusRule, Grafana dashboard
kubectl patch cm otel-gateway-config -n monitoring ... # Add traces pipeline → Tempo
kubectl apply ...                                       # Deploy Grafana Tempo
helm upgrade avika ... --set gateway.image.tag=1.119.0 # Deploy gateway with OTel SDK
```

All infrastructure changes are in `deploy/k8s/avika-observability.yaml` and committed to `master`. The OTel SDK changes are in `cmd/gateway/tracer.go`.
