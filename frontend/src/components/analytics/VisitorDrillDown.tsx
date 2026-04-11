"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, X, ArrowLeft, Monitor, Smartphone, Globe, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  window: string;
  category: "devices" | "browsers" | "os";
  initialGroup?: string;
  onClose: () => void;
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

const categoryLabels: Record<string, string> = { devices: "Devices", browsers: "Browsers", os: "Operating Systems" };
const categoryIcons: Record<string, typeof Monitor> = { devices: Smartphone, browsers: Monitor, os: Globe };

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
};

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.15 } }),
};

export function VisitorDrillDown({ window, category, initialGroup, onClose }: Props) {
  const [group, setGroup] = useState<string | null>(initialGroup || null);
  const [version, setVersion] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);

  const level = version ? 3 : group ? 2 : 1;
  const Icon = categoryIcons[category] || Monitor;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ window, category });
      if (group) params.set("group", group);
      if (version) params.set("version", version);
      const res = await apiFetch(`/api/analytics/visitor-drilldown?${params}`);
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
  }, [window, category, group, version]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goForward = (nextGroup?: string, nextVersion?: string) => {
    setDirection(1);
    if (nextVersion) setVersion(nextVersion);
    else if (nextGroup) { setGroup(nextGroup); setVersion(null); }
  };
  const goBack = () => {
    setDirection(-1);
    if (version) setVersion(null);
    else if (group) setGroup(null);
    else onClose();
  };

  // Breadcrumbs
  const crumbs: { label: string; onClick: () => void }[] = [
    { label: categoryLabels[category], onClick: () => { setDirection(-1); setGroup(null); setVersion(null); } },
  ];
  if (group) crumbs.push({ label: group, onClick: () => { setDirection(-1); setVersion(null); } });
  if (version) crumbs.push({ label: version, onClick: () => {} });

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {level > 1 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
              <Button variant="ghost" size="sm" onClick={goBack} className="h-7 w-7 p-0"><ArrowLeft className="h-4 w-4" /></Button>
            </motion.div>
          )}
          <Icon className="h-4 w-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
          <div className="flex items-center gap-1 text-sm">
            {crumbs.map((b, i) => (
              <motion.span key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" style={{ color: "rgb(var(--theme-text-muted))" }} />}
                <button onClick={b.onClick} className={`hover:underline ${i === crumbs.length - 1 ? "font-semibold" : ""}`} style={{ color: i === crumbs.length - 1 ? "rgb(var(--theme-text))" : "rgb(var(--theme-text-muted))" }}>
                  {b.label}
                </button>
              </motion.span>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div key={`${group}-${version}`} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-red-500">Failed to load data</p>
              <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
            </div>
          ) : (
            <>
              {/* Level 1: Groups */}
              {level === 1 && data?.groups && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {data.groups.map((g: any, i: number) => (
                    <motion.button key={g.name} custom={i} variants={rowVariants} initial="hidden" animate="visible" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}
                      onClick={() => goForward(g.name)}
                      className="p-3 rounded-lg border text-left transition-colors"
                      style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}>
                      <p className="font-medium text-sm truncate" style={{ color: "rgb(var(--theme-text))" }}>{g.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-lg font-bold" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(g.count)}</span>
                        <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{g.percentage.toFixed(1)}%</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatNumber(g.visitors)} visitors</p>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Level 2: Details (versions) */}
              {level === 2 && data?.details && (
                <Table>
                  <TableHeader>
                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Hits</TableHead>
                      <TableHead className="text-right">Visitors</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Avg Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.details.map((d: any, i: number) => (
                      <motion.tr key={d.version || i} custom={i} variants={rowVariants} initial="hidden" animate="visible"
                        className="cursor-pointer hover:bg-blue-500/5 border-b" onClick={() => goForward(group!, d.version)}
                        style={{ borderColor: "rgb(var(--theme-border))" }}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{d.version || "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(d.count)}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.visitors)}</TableCell>
                        <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>{d.percentage.toFixed(1)}%</TableCell>
                        <TableCell className={`text-right ${d.avg_latency_ms > 200 ? "text-amber-500" : ""}`}>{Math.round(d.avg_latency_ms)}ms</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Level 3: URLs */}
              {level === 3 && data?.urls && (
                <Table>
                  <TableHeader>
                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Hits</TableHead>
                      <TableHead className="text-right">Avg Latency</TableHead>
                      <TableHead className="text-right">Bandwidth</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.urls.map((u: any, i: number) => (
                      <motion.tr key={u.uri} custom={i} variants={rowVariants} initial="hidden" animate="visible" className="border-b" style={{ borderColor: "rgb(var(--theme-border))" }}>
                        <TableCell className="font-mono text-xs truncate max-w-[250px]" title={u.uri}><FileText className="h-3 w-3 inline mr-1" />{u.uri}</TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(u.count)}</TableCell>
                        <TableCell className={`text-right ${u.avg_latency_ms > 200 ? "text-amber-500" : ""}`}>{Math.round(u.avg_latency_ms)}ms</TableCell>
                        <TableCell className="text-right text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatBytes(u.bandwidth)}</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Empty */}
              {!loading && ((level === 1 && !data?.groups?.length) || (level === 2 && !data?.details?.length) || (level === 3 && !data?.urls?.length)) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6" style={{ color: "rgb(var(--theme-text-muted))" }}>
                  No data for this selection.
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
