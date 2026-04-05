"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, X, ArrowLeft, Globe, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrillDownState {
  class?: string;    // "4xx"
  code?: number;     // 404
  uri?: string;      // "/api/v1/users"
}

interface Props {
  window: string;
  agentId?: string;
  projectId?: string;
  environmentId?: string;
  initialClass?: string;  // open directly at a class
  onClose: () => void;
}

function statusColor(code: number | string): string {
  const c = typeof code === "string" ? parseInt(code) : code;
  if (c >= 500) return "text-red-500";
  if (c >= 400) return "text-amber-500";
  if (c >= 300) return "text-blue-500";
  return "text-emerald-500";
}

function statusBg(code: number | string): string {
  const c = typeof code === "string" ? parseInt(code) : code;
  if (c >= 500) return "bg-red-500";
  if (c >= 400) return "bg-amber-500";
  if (c >= 300) return "bg-blue-500";
  return "bg-emerald-500";
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

export function StatusDrillDown({ window, agentId, initialClass, onClose }: Props) {
  const [state, setState] = useState<DrillDownState>(initialClass ? { class: initialClass } : {});
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const level = state.uri ? 4 : state.code ? 3 : state.class ? 2 : 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ window });
      if (agentId && agentId !== "all") params.set("agent_id", agentId);
      if (state.class) params.set("class", state.class);
      if (state.code) params.set("code", String(state.code));
      if (state.uri) params.set("uri", state.uri);

      const res = await apiFetch(`/api/analytics/status-drilldown?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Status drilldown fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [window, agentId, state]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Breadcrumb navigation
  const breadcrumbs: { label: string; onClick: () => void }[] = [
    { label: "Status Codes", onClick: () => setState({}) },
  ];
  if (state.class) {
    breadcrumbs.push({ label: state.class, onClick: () => setState({ class: state.class }) });
  }
  if (state.code) {
    breadcrumbs.push({ label: String(state.code), onClick: () => setState({ class: state.class, code: state.code }) });
  }
  if (state.uri) {
    breadcrumbs.push({ label: state.uri.length > 30 ? state.uri.slice(0, 30) + "..." : state.uri, onClick: () => {} });
  }

  return (
    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {level > 1 && (
              <Button variant="ghost" size="sm" onClick={() => {
                if (state.uri) setState({ class: state.class, code: state.code });
                else if (state.code) setState({ class: state.class });
                else setState({});
              }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-1 text-sm">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" style={{ color: "rgb(var(--theme-text-muted))" }} />}
                  <button
                    onClick={b.onClick}
                    className={`hover:underline ${i === breadcrumbs.length - 1 ? "font-semibold" : ""}`}
                    style={{ color: i === breadcrumbs.length - 1 ? "rgb(var(--theme-text))" : "rgb(var(--theme-text-muted))" }}
                  >
                    {b.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Level 1: Status classes */}
            {level === 1 && data?.classes && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.classes.map((c: any) => (
                  <button
                    key={c.class}
                    onClick={() => setState({ class: c.class })}
                    className="p-4 rounded-lg border text-left transition-colors hover:border-blue-500/50"
                    style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={`font-mono ${statusColor(c.class === "2xx" ? 200 : c.class === "3xx" ? 300 : c.class === "4xx" ? 400 : 500)}`}>
                        {c.class}
                      </Badge>
                      <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{c.percentage.toFixed(1)}%</span>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(c.count)}</p>
                    {c.top_code > 0 && (
                      <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Top: {c.top_code} ({c.top_code_pct.toFixed(0)}%)
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Level 2: Individual codes */}
            {level === 2 && data?.codes && (
              <Table>
                <TableHeader>
                  <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Avg Latency</TableHead>
                    <TableHead>Top URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.codes.map((c: any) => (
                    <TableRow
                      key={c.code}
                      className="cursor-pointer hover:bg-blue-500/5"
                      onClick={() => setState({ class: state.class, code: c.code })}
                      style={{ borderColor: "rgb(var(--theme-border))" }}
                    >
                      <TableCell>
                        <Badge variant="outline" className={`font-mono ${statusColor(c.code)}`}>{c.code}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(c.count)}</TableCell>
                      <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>{c.percentage.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{Math.round(c.avg_latency_ms)}ms</TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[200px]" title={c.top_uri}>{c.top_uri}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Level 3: URLs */}
            {level === 3 && data?.uris && (
              <Table>
                <TableHeader>
                  <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                    <TableHead className="text-right">P95</TableHead>
                    <TableHead className="text-right">Bandwidth</TableHead>
                    <TableHead className="text-right">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.uris.map((u: any) => (
                    <TableRow
                      key={u.uri}
                      className="cursor-pointer hover:bg-blue-500/5"
                      onClick={() => setState({ class: state.class, code: state.code, uri: u.uri })}
                      style={{ borderColor: "rgb(var(--theme-border))" }}
                    >
                      <TableCell className="font-mono text-xs truncate max-w-[250px]" title={u.uri}>
                        <FileText className="h-3 w-3 inline mr-1" />{u.uri}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(u.count)}</TableCell>
                      <TableCell className="text-right">{Math.round(u.avg_latency_ms)}ms</TableCell>
                      <TableCell className="text-right">{Math.round(u.p95_latency_ms)}ms</TableCell>
                      <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatBytes(u.bandwidth)}</TableCell>
                      <TableCell className="text-right text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{u.last_seen}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Level 4: Traces */}
            {level === 4 && data?.traces && (
              <Table>
                <TableHeader>
                  <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableHead>Time</TableHead>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Client IP</TableHead>
                    <TableHead>User Agent</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                    <TableHead>Upstream</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.traces.map((t: any, i: number) => (
                    <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                      <TableCell className="text-xs whitespace-nowrap">
                        <Clock className="h-3 w-3 inline mr-1" />{t.timestamp}
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]" title={t.request_id}>
                        {t.request_id ? t.request_id.slice(0, 16) + "..." : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Globe className="h-3 w-3 inline mr-1" />
                        {t.client_ip}
                        {t.country && <span className="ml-1 text-[10px]" style={{ color: "rgb(var(--theme-text-muted))" }}>({t.country})</span>}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[150px]" title={t.user_agent}>{t.user_agent?.split(" ")[0] || "—"}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${t.latency_ms > 500 ? "text-red-500" : t.latency_ms > 200 ? "text-amber-500" : ""}`}>
                        {Math.round(t.latency_ms)}ms
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.upstream || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Empty state */}
            {!loading && (
              (level === 1 && (!data?.classes || data.classes.length === 0)) ||
              (level === 2 && (!data?.codes || data.codes.length === 0)) ||
              (level === 3 && (!data?.uris || data.uris.length === 0)) ||
              (level === 4 && (!data?.traces || data.traces.length === 0))
            ) && (
              <div className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>
                No data for this selection in the current time window.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
