/**
 * In-memory counters for Prometheus metrics. Used by /api/metrics and optionally middleware.
 * Counters are per-process; in serverless they may be per-instance.
 */

const counters: Map<string, number> = new Map();

function key(path: string, method: string): string {
  const n = path.replace(/\/api\/servers\/[^/]+/g, "/api/servers/:id");
  return `${method}\t${n}`;
}

export function recordRequest(path: string, method: string): void {
  const k = key(path, method);
  counters.set(k, (counters.get(k) ?? 0) + 1);
}

export function recordError(): void {
  const k = "__errors__";
  counters.set(k, (counters.get(k) ?? 0) + 1);
}

/** Escape Prometheus label value (replace \ and ") */
function escapeLabel(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Prometheus text format for avika_frontend_* metrics */
export function toPrometheusText(version: string): string {
  const lines: string[] = [];

  lines.push("# HELP avika_frontend_requests_total Total HTTP requests received");
  lines.push("# TYPE avika_frontend_requests_total counter");
  for (const [k, count] of counters) {
    if (k === "__errors__") continue;
    const [method, path] = k.split("\t");
    const pathLabel = escapeLabel(path);
    const methodLabel = escapeLabel(method);
    lines.push(`avika_frontend_requests_total{method="${methodLabel}",path="${pathLabel}"} ${count}`);
  }
  lines.push("# HELP avika_frontend_build_info Frontend build information");
  lines.push("# TYPE avika_frontend_build_info gauge");
  lines.push(`avika_frontend_build_info{version="${escapeLabel(version)}"} 1`);

  const errCount = counters.get("__errors__") ?? 0;
  lines.push("# HELP avika_frontend_errors_total Total errors");
  lines.push("# TYPE avika_frontend_errors_total counter");
  lines.push(`avika_frontend_errors_total ${errCount}`);

  return lines.join("\n");
}
