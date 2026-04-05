"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, X, ArrowLeft, Globe, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface DrillDownState {
  class?: string;
  code?: number;
  uri?: string;
}

interface Props {
  window: string;
  agentId?: string;
  /** Pie chart data from parent — used for the mini pie context indicator */
  statusChartData?: { name: string; value: number; color: string }[];
  initialClass?: string;
  onClose: () => void;
}

function statusColor(code: number | string): string {
  const c = typeof code === "string" ? parseInt(code) : code;
  if (c >= 500) return "text-red-500";
  if (c >= 400) return "text-amber-500";
  if (c >= 300) return "text-blue-500";
  return "text-emerald-500";
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

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.2 } }),
};

export function StatusDrillDown({ window, agentId, statusChartData, initialClass, onClose }: Props) {
  const [state, setState] = useState<DrillDownState>(initialClass ? { class: initialClass } : {});
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);

  const level = state.uri ? 4 : state.code ? 3 : state.class ? 2 : 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ window });
      if (agentId && agentId !== "all") params.set("agent_id", agentId);
      if (state.class) params.set("class", state.class);
      if (state.code) params.set("code", String(state.code));
      if (state.uri) params.set("uri", state.uri);

      const res = await apiFetch(`/api/analytics/status-drilldown?${params}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(`API returned ${res.status}`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [window, agentId, state]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goForward = (next: DrillDownState) => { setDirection(1); setState(next); };
  const goBack = () => {
    setDirection(-1);
    if (state.uri) setState({ class: state.class, code: state.code });
    else if (state.code) setState({ class: state.class });
    else if (state.class) setState({});
    else onClose();
  };

  // Breadcrumbs
  const crumbs: { label: string; onClick: () => void }[] = [
    { label: "HTTP Status", onClick: () => { setDirection(-1); setState({}); } },
  ];
  if (state.class) crumbs.push({ label: state.class.toUpperCase(), onClick: () => { setDirection(-1); setState({ class: state.class }); } });
  if (state.code) crumbs.push({ label: String(state.code), onClick: () => { setDirection(-1); setState({ class: state.class, code: state.code }); } });
  if (state.uri) crumbs.push({ label: state.uri.length > 25 ? state.uri.slice(0, 25) + "..." : state.uri, onClick: () => {} });

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      {/* Header with breadcrumb + mini pie */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {level > 1 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
              <Button variant="ghost" size="sm" onClick={goBack} className="h-7 w-7 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Mini pie context */}
          {level > 1 && statusChartData && statusChartData.length > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-8 h-8 cursor-pointer"
              onClick={() => { setDirection(-1); setState({}); }}
              title="Back to overview"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} cx="50%" cy="50%" outerRadius={14} innerRadius={6} dataKey="value" stroke="none">
                    {statusChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm">
            {crumbs.map((b, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-1"
              >
                {i > 0 && <ChevronRight className="h-3 w-3" style={{ color: "rgb(var(--theme-text-muted))" }} />}
                <button
                  onClick={b.onClick}
                  className={`hover:underline ${i === crumbs.length - 1 ? "font-semibold" : ""}`}
                  style={{ color: i === crumbs.length - 1 ? "rgb(var(--theme-text))" : "rgb(var(--theme-text-muted))" }}
                >
                  {b.label}
                </button>
              </motion.span>
            ))}
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content with slide transitions */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={`${state.class}-${state.code}-${state.uri}`}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-red-500">Failed to load data</p>
              <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
            </div>
          ) : (
            <>
              {/* Level 1: Class cards */}
              {level === 1 && data?.classes && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.classes.map((c: any, i: number) => (
                    <motion.button
                      key={c.class}
                      custom={i}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ scale: 1.03, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => goForward({ class: c.class })}
                      className="p-4 rounded-lg border text-left transition-colors"
                      style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={`font-mono ${statusColor(c.class === "2xx" ? 200 : c.class === "3xx" ? 300 : c.class === "4xx" ? 400 : 500)}`}>
                          {c.class}
                        </Badge>
                        <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{c.percentage.toFixed(1)}%</span>
                      </div>
                      <p className="text-xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(c.count)}</p>
                      {c.top_code > 0 && (
                        <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                          Top: {c.top_code} ({c.top_code_pct.toFixed(0)}%)
                        </p>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Level 2: Codes */}
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
                    {data.codes.map((c: any, i: number) => (
                      <motion.tr
                        key={c.code}
                        custom={i}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        className="cursor-pointer hover:bg-blue-500/5 border-b"
                        onClick={() => goForward({ class: state.class, code: c.code })}
                        style={{ borderColor: "rgb(var(--theme-border))" }}
                      >
                        <TableCell>
                          <Badge variant="outline" className={`font-mono ${statusColor(c.code)}`}>{c.code}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(c.count)}</TableCell>
                        <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>{c.percentage.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{Math.round(c.avg_latency_ms)}ms</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[180px]" title={c.top_uri}>{c.top_uri}</TableCell>
                      </motion.tr>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.uris.map((u: any, i: number) => (
                      <motion.tr
                        key={u.uri}
                        custom={i}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        className="cursor-pointer hover:bg-blue-500/5 border-b"
                        onClick={() => goForward({ class: state.class, code: state.code, uri: u.uri })}
                        style={{ borderColor: "rgb(var(--theme-border))" }}
                      >
                        <TableCell className="font-mono text-xs truncate max-w-[220px]" title={u.uri}>
                          <FileText className="h-3 w-3 inline mr-1" />{u.uri}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(u.count)}</TableCell>
                        <TableCell className="text-right">{Math.round(u.avg_latency_ms)}ms</TableCell>
                        <TableCell className="text-right">{Math.round(u.p95_latency_ms)}ms</TableCell>
                        <TableCell className="text-right text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatBytes(u.bandwidth)}</TableCell>
                      </motion.tr>
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
                      <TableHead>Trace</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>User Agent</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.traces.map((t: any, i: number) => (
                      <motion.tr
                        key={i}
                        custom={i}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        className="border-b"
                        style={{ borderColor: "rgb(var(--theme-border))" }}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          <Clock className="h-3 w-3 inline mr-1" />{t.timestamp}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[100px]" title={t.request_id}>
                          {t.request_id ? t.request_id.slice(0, 12) + "..." : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Globe className="h-3 w-3 inline mr-1" />{t.client_ip}
                          {t.country && <span className="ml-1 opacity-60">({t.country})</span>}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]" title={t.user_agent}>{t.user_agent?.split(" ")[0] || "—"}</TableCell>
                        <TableCell className={`text-right text-sm font-medium ${t.latency_ms > 500 ? "text-red-500" : t.latency_ms > 200 ? "text-amber-500" : ""}`}>
                          {Math.round(t.latency_ms)}ms
                        </TableCell>
                      </motion.tr>
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
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8"
                  style={{ color: "rgb(var(--theme-text-muted))" }}
                >
                  No data for this selection in the current time window.
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
