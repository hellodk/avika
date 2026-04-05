"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { Users, Globe, Activity, Bot, Monitor, Smartphone, Tablet, Search, Link2, AlertTriangle, FileText, Clock } from "lucide-react";
import { VisitorDrillDown } from "@/components/analytics/VisitorDrillDown";
import { AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme-provider";

interface VisitorAnalytics {
  summary: {
    unique_visitors: string;
    total_hits: string;
    total_bandwidth: string;
    bot_hits: string;
    human_hits: string;
  };
  browsers: Array<{
    browser: string;
    version: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  operating_systems: Array<{
    os: string;
    version: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  referrers: Array<{
    referrer: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  not_found: Array<{
    path: string;
    hits: string;
    last_seen: string;
  }>;
  hourly: Array<{
    hour: number;
    hits: string;
    visitors: string;
    bandwidth: string;
  }>;
  devices: {
    desktop: string;
    mobile: string;
    tablet: string;
    other: string;
  };
  static_files: Array<{
    path: string;
    hits: string;
    bandwidth: string;
  }>;
  requested_urls?: Array<{
    uri: string;
    hits: string;
    bandwidth: string;
    status: number;
  }>;
  status_codes?: Array<{
    code: number;
    hits: string;
    percentage: number;
  }>;
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function formatNumber(num: string | number): string {
  const n = typeof num === "string" ? parseInt(num) : num;
  if (isNaN(n)) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatBytes(bytes: string | number): string {
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b) || b === 0) return "0 B";
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

function statusColor(code: number): string {
  if (code >= 500) return "text-red-500";
  if (code >= 400) return "text-amber-500";
  if (code >= 300) return "text-blue-500";
  return "text-emerald-500";
}

export default function VisitorsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [drillDown, setDrillDown] = useState<{ category: "devices" | "browsers" | "os"; group?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState("24h");

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/visitor-analytics?timeWindow=${timeWindow}`);
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error("Failed to fetch visitor analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeWindow]);

  const totalHits = parseInt(data?.summary?.total_hits || "0");
  const botHits = parseInt(data?.summary?.bot_hits || "0");
  const humanHits = parseInt(data?.summary?.human_hits || "0");
  const botPct = totalHits > 0 ? ((botHits / totalHits) * 100).toFixed(1) : "0";

  const deviceData = data?.devices
    ? [
      { name: "Desktop", value: parseInt(data.devices.desktop || "0"), color: "#3b82f6" },
      { name: "Mobile", value: parseInt(data.devices.mobile || "0"), color: "#10b981" },
      { name: "Tablet", value: parseInt(data.devices.tablet || "0"), color: "#f59e0b" },
      { name: "Other", value: parseInt(data.devices.other || "0"), color: "#8b5cf6" },
    ].filter((d) => d.value > 0)
    : [];

  const browserChartData = (data?.browsers || []).slice(0, 6).map((b) => ({
    name: b.browser,
    hits: parseInt(b.hits),
  }));

  const osChartData = (data?.operating_systems || []).slice(0, 6).map((o) => ({
    name: o.os,
    hits: parseInt(o.hits),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
            Visitor Analytics
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Audience insights, devices, referrers, and content performance
          </p>
        </div>
        <Select value={timeWindow} onValueChange={setTimeWindow}>
          <SelectTrigger className="w-[160px]" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "Unique Visitors", value: formatNumber(data?.summary?.unique_visitors || "0"), icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "Human Traffic", value: formatNumber(humanHits), icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { title: "Bot Traffic", value: `${botPct}%`, icon: Bot, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "404 Errors", value: formatNumber(data?.not_found?.reduce((sum: number, nf: any) => sum + parseInt(nf.hits || "0"), 0) || 0), icon: Search, color: "text-red-500", bg: "bg-red-500/10" },
        ].map((kpi) => (
          <Card key={kpi.title} style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>{kpi.title}</p>
                  {loading ? (
                    <Skeleton className="h-8 w-20 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold mt-1" style={{ color: "rgb(var(--theme-text))" }}>{kpi.value}</p>
                  )}
                </div>
                <div className={`p-3 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 1: Hourly Traffic + Device Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Hourly Traffic</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Hits distribution across hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={data?.hourly || []}>
                    <defs>
                      <linearGradient id="fillHits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} stroke="rgb(var(--theme-text-muted))" fontSize={12} />
                    <YAxis stroke="rgb(var(--theme-text-muted))" fontSize={12} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} labelFormatter={(h) => `${h}:00`} />
                    <Area type="monotone" dataKey="hits" stroke="#3b82f6" strokeWidth={2} fill="url(#fillHits)" name="Hits" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Devices</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
              {deviceData.length > 0 ? `${deviceData.length} device types` : "No device data"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {loading ? (
                <Skeleton className="h-full" />
              ) : deviceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={deviceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} cursor="pointer" onClick={(_: any, index: number) => { const d = deviceData[index]; if (d) setDrillDown({ category: "devices", group: d.name.toLowerCase() }); }}>
                      {deviceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatNumber(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>No device data yet</p>
                </div>
              )}
            </div>
            {/* Human vs Bot bar */}
            {!loading && totalHits > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                  <span>Human ({formatNumber(humanHits)})</span>
                  <span>Bot ({formatNumber(botHits)})</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "rgb(var(--theme-border))" }}>
                  <div className="h-full bg-emerald-500" style={{ width: `${100 - parseFloat(botPct)}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${botPct}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Browsers + OS (clickable for drill-down) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <Monitor className="h-4 w-4" /> Browsers
            </CardTitle>
            <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>Click a bar to drill down</p>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {loading ? <Skeleton className="h-full" /> : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={browserChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis type="number" fontSize={12} stroke="rgb(var(--theme-text-muted))" tickFormatter={(v) => formatNumber(v)} />
                    <YAxis dataKey="name" type="category" width={80} fontSize={12} stroke="rgb(var(--theme-text-muted))" />
                    <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} />
                    <Bar dataKey="hits" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Hits" cursor="pointer" onClick={(d: any) => d?.name && setDrillDown({ category: "browsers", group: d.name })} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <AnimatePresence>
              {drillDown?.category === "browsers" && (
                <VisitorDrillDown window={timeWindow} category="browsers" initialGroup={drillDown.group} onClose={() => setDrillDown(null)} />
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <Smartphone className="h-4 w-4" /> Operating Systems
            </CardTitle>
            <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>Click a bar to drill down</p>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {loading ? <Skeleton className="h-full" /> : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={osChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis type="number" fontSize={12} stroke="rgb(var(--theme-text-muted))" tickFormatter={(v) => formatNumber(v)} />
                    <YAxis dataKey="name" type="category" width={80} fontSize={12} stroke="rgb(var(--theme-text-muted))" />
                    <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} />
                    <Bar dataKey="hits" fill="#10b981" radius={[0, 4, 4, 0]} name="Hits" cursor="pointer" onClick={(d: any) => d?.name && setDrillDown({ category: "os", group: d.name })} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <AnimatePresence>
              {drillDown?.category === "os" && (
                <VisitorDrillDown window={timeWindow} category="os" initialGroup={drillDown.group} onClose={() => setDrillDown(null)} />
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Device drill-down (triggered from pie chart above) */}
      <AnimatePresence>
        {drillDown?.category === "devices" && (
          <VisitorDrillDown window={timeWindow} category="devices" initialGroup={drillDown.group} onClose={() => setDrillDown(null)} />
        )}
      </AnimatePresence>

      {/* Row 3: Referrers + 404 Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <Link2 className="h-4 w-4" /> Top Referrers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right w-20">Hits</TableHead>
                  <TableHead className="text-right w-16">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.referrers || []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>No referrer data</TableCell></TableRow>
                ) : (data?.referrers || []).slice(0, 8).map((r, i) => (
                  <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableCell className="font-mono text-xs truncate max-w-[250px]" title={r.referrer}>{r.referrer || "(direct)"}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(r.hits)}</TableCell>
                    <TableCell className="text-right text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>{r.percentage?.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <AlertTriangle className="h-4 w-4 text-amber-500" /> 404 Errors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableHead>Path</TableHead>
                  <TableHead className="text-right w-20">Hits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.not_found || []).length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>No 404 errors</TableCell></TableRow>
                ) : (data?.not_found || []).slice(0, 8).map((nf, i) => (
                  <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableCell className="font-mono text-xs truncate max-w-[300px]" title={nf.path}>{nf.path}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(nf.hits)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Top URLs + Status Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <FileText className="h-4 w-4" /> Top Requested URLs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableHead>Path</TableHead>
                  <TableHead className="text-right w-20">Hits</TableHead>
                  <TableHead className="text-right w-24">Bandwidth</TableHead>
                  <TableHead className="text-right w-16">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.requested_urls || []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>No URL data</TableCell></TableRow>
                ) : (data?.requested_urls || []).slice(0, 10).map((u, i) => (
                  <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableCell className="font-mono text-xs truncate max-w-[300px]" title={u.uri}>{u.uri}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(u.hits)}</TableCell>
                    <TableCell className="text-right text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatBytes(u.bandwidth)}</TableCell>
                    <TableCell className={`text-right text-sm font-medium ${statusColor(u.status)}`}>{u.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
              <Clock className="h-4 w-4 text-amber-500" /> Slowest Endpoints
            </CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>By average response time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.requested_urls || []).length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "rgb(var(--theme-text-muted))" }}>No URL data</p>
            ) : [...(data?.requested_urls || [])].sort((a: any, b: any) => parseFloat(b.bandwidth || "0") - parseFloat(a.bandwidth || "0")).slice(0, 6).map((u: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <span className="font-mono text-xs truncate max-w-[180px]" style={{ color: "rgb(var(--theme-text))" }} title={u.uri}>{u.uri}</span>
                <span className="text-xs font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>{formatBytes(u.bandwidth)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
