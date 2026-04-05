"use client";

import { useState, useEffect, Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    TrendingUp,
    AlertCircle,
    Activity,
    Globe,
    Server,
    Radio,
    Download,
    ChevronDown,
    RefreshCw,
    ArrowUpRight,
    LayoutDashboard,
    Users,
} from "lucide-react";
import { TimeRangePicker, TimeRange } from "@/components/ui/time-range-picker";
import { AutoRefreshSelector, AutoRefreshConfig } from "@/components/ui/auto-refresh-selector";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { StatusDrillDown } from "@/components/analytics/StatusDrillDown";
import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const VisitorAnalyticsContent = dynamic(
    () => import("@/app/analytics/visitors/page").then((m) => ({ default: m.default })),
    { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin" style={{ color: "rgb(var(--theme-text-muted))" }} /></div> }
);
const GeoAnalyticsContent = dynamic(
    () => import("@/app/analytics/geo/page").then((m) => ({ default: m.default })),
    { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin" style={{ color: "rgb(var(--theme-text-muted))" }} /></div> }
);
const TracesContent = dynamic(
    () => import("@/app/analytics/traces/page").then((m) => ({ default: m.default })),
    { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin" style={{ color: "rgb(var(--theme-text-muted))" }} /></div> }
);
import { LiveMetricsProvider, useLiveMetrics } from "@/components/analytics/LiveMetricsProvider";
import { TrafficDashboard } from "@/components/analytics/dashboards/TrafficDashboard";
import { useTheme } from "@/lib/theme-provider";
import { getChartColorsForTheme } from "@/lib/chart-colors";
import { useProject } from "@/lib/project-context";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const initialData = {
    requestRate: [],
    statusDistribution: [],
    topEndpoints: [],
    latencyTrend: [],
    summary: {
        total_requests: 0,
        error_rate: 0,
        avg_latency: 0,
        total_bandwidth: 0,
        requests_delta: 0,
        latency_delta: 0,
        error_rate_delta: 0
    },
    latency_distribution: [],
    server_distribution: [],
    system_metrics: [],
    connections_history: [],
    http_status_metrics: {
        total_status_200_24H: 0,
        total_status_404_24H: 0,
        total_status_503: 0
    },
    insights: [],
    gateway_metrics: []
};

function AnalyticsContent() {
    return (
        <LiveMetricsProvider>
            <AnalyticsView />
        </LiveMetricsProvider>
    );
}

function AnalyticsView() {
    const { isLive, setIsLive, isConnected, data: liveData } = useLiveMetrics();
    const { theme } = useTheme();
    const { selectedProject, selectedEnvironment } = useProject();

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = searchParams.get("tab") || "overview";

    const [timeRange, setTimeRange] = useState<TimeRange>({
        type: 'relative',
        value: '24h',
        label: 'Last 24 hours'
    });
    const [autoRefresh, setAutoRefresh] = useState<AutoRefreshConfig>({
        enabled: true,
        interval: 30000,
        label: '30s'
    });
    const [timezone, setTimezone] = useState('UTC');
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [agents, setAgents] = useState<{ agent_id?: string; id?: string; hostname?: string; status?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyticsData, setAnalyticsData] = useState<typeof initialData>(initialData);
    const [drillDownClass, setDrillDownClass] = useState<string | null>(null);

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", value);
        router.push(`${pathname}?${params.toString()}`);
    };

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await apiFetch('/api/servers');
                if (res.ok) {
                    const data = await res.json();
                    setAgents(data.agents || []);
                }
            } catch (err) {
                console.error("Failed to fetch agents:", err);
            }
        };
        fetchAgents();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                let queryParams = '';
                if (timeRange.type === 'relative' && timeRange.value) {
                    queryParams = `window=${timeRange.value}`;
                } else if (timeRange.type === 'absolute' && timeRange.from && timeRange.to) {
                    queryParams = `from=${timeRange.from.getTime()}&to=${timeRange.to.getTime()}`;
                }

                const agentParam = selectedAgent !== 'all' ? `&agent_id=${selectedAgent}` : '';
                const tzParam = `&timezone=${encodeURIComponent(timezone === 'Browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC')}`;
                
                // Project/environment filtering
                let filterParam = '';
                if (selectedEnvironment) {
                    filterParam = `&environment_id=${selectedEnvironment.id}`;
                } else if (selectedProject) {
                    filterParam = `&project_id=${selectedProject.id}`;
                }
                
                const res = await apiFetch(`/api/analytics?${queryParams}${agentParam}${tzParam}${filterParam}`);
                if (res.ok) {
                    const data = await res.json();
                    setAnalyticsData({
                        requestRate: data.request_rate || [],
                        statusDistribution: data.status_distribution || [],
                        topEndpoints: data.top_endpoints || [],
                        latencyTrend: data.latency_trend || [],
                        summary: data.summary || initialData.summary,
                        latency_distribution: data.latency_distribution || [],
                        server_distribution: data.server_distribution || [],
                        system_metrics: data.system_metrics || [],
                        connections_history: data.connections_history || [],
                        http_status_metrics: data.http_status_metrics || initialData.http_status_metrics,
                        insights: data.insights || [],
                        gateway_metrics: data.gateway_metrics || []
                    });
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        let interval: NodeJS.Timeout | null = null;
        if (autoRefresh.enabled && autoRefresh.interval > 0) {
            interval = setInterval(fetchData, autoRefresh.interval);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [timeRange, autoRefresh, selectedAgent, timezone, selectedProject, selectedEnvironment]);

    // Update analytics data when live data arrives
    useEffect(() => {
        if (isLive && liveData) {
            setAnalyticsData({
                requestRate: liveData.request_rate || [],
                statusDistribution: liveData.status_distribution || [],
                topEndpoints: liveData.top_endpoints || [],
                latencyTrend: liveData.latency_trend || [],
                summary: liveData.summary || initialData.summary,
                latency_distribution: liveData.latency_distribution || [],
                server_distribution: liveData.server_distribution || [],
                system_metrics: liveData.system_metrics || [],
                connections_history: liveData.connections_history || [],
                http_status_metrics: liveData.http_status_metrics || initialData.http_status_metrics,
                insights: liveData.insights || [],
                gateway_metrics: liveData.gateway_metrics || []
            });
        }
    }, [isLive, liveData]);

    // Summary Stats
    const summary = analyticsData.summary;
    const chartColors = getChartColorsForTheme(theme);
    const sparkGrid = chartColors.grid;
    const sparkAxis = chartColors.axis;
    const sparkTooltipBg = chartColors.tooltipBg;
    const sparkTooltipText = chartColors.tooltipText;
    const sparkTooltipBorder = chartColors.tooltipBorder;

    const requestRateSparkData = analyticsData.requestRate.map(
        (p: { time?: string; requests?: number | string; errors?: number | string }) => ({
            time: p.time ?? "",
            requests: Number(p.requests) || 0,
            errors: Number(p.errors) || 0,
        })
    );
    const hasSparkData = requestRateSparkData.length > 0;

    const formatBandwidth = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const toggleTimezone = () => {
        setTimezone(prev => prev === 'UTC' ? 'Browser' : 'UTC');
    };

    const handleExport = (format: 'csv' | 'json') => {
        let filterParam = '';
        if (selectedEnvironment) {
            filterParam = `&environment_id=${selectedEnvironment.id}`;
        } else if (selectedProject) {
            filterParam = `&project_id=${selectedProject.id}`;
        }
        const url = `/api/analytics/export?format=${format}&window=${timeRange.value}&agent_id=${selectedAgent}${filterParam}`;
        window.open(url, '_blank');
    };

    const selectedAgentData = agents.find((a) => (a.agent_id || a.id) === selectedAgent);
    const isOffline = selectedAgentData?.status === 'offline';

    // Softer insight banners (readable without dominating the page)
    const isLight = theme === "light";
    const getInsightStyle = (type: string) => {
        switch (type) {
            case "critical":
                return isLight
                    ? { wrap: "border-red-200/90 bg-red-50/90", title: "text-red-900", body: "text-red-900/75", icon: AlertCircle }
                    : { wrap: "border-red-500/25 bg-red-500/[0.06]", title: "text-red-200", body: "text-red-200/70", icon: AlertCircle };
            case "warning":
                return isLight
                    ? { wrap: "border-amber-200/90 bg-amber-50/80", title: "text-amber-950", body: "text-amber-900/75", icon: TrendingUp }
                    : { wrap: "border-amber-500/25 bg-amber-500/[0.06]", title: "text-amber-200", body: "text-amber-200/70", icon: TrendingUp };
            default:
                return isLight
                    ? { wrap: "border-blue-200/90 bg-blue-50/80", title: "text-blue-950", body: "text-blue-900/75", icon: Activity }
                    : { wrap: "border-blue-500/25 bg-blue-500/[0.06]", title: "text-blue-200", body: "text-blue-200/70", icon: Activity };
        }
    };

    return (
        <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: 'rgb(var(--theme-text))' }}>
                        Analytics
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        Comprehensive metrics and insights across your NGINX fleet
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Agent Selector */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                        <Server className="h-4 w-4" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                        <select
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            className="text-sm font-medium bg-transparent border-none focus:ring-0 cursor-pointer pr-6"
 style={{ color: 'rgb(var(--theme-text))' }}
                        >
                            <option value="all">All Servers</option>
                            {agents.map((agent) => (
                                <option key={agent.agent_id || agent.id} value={agent.agent_id || agent.id}>
                                    {agent.hostname || (agent.agent_id || agent.id || "").substring(0, 12)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Timezone Toggle */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleTimezone}
                        className="h-9 hover:opacity-90"
 style={{ borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                    >
                        <Globe className="h-4 w-4 mr-2" />
                        {timezone}
                    </Button>

                    {/* Live Mode Toggle */}
                    <Button
                        variant={isLive ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsLive(!isLive)}
                        className={`h-9 ${isLive ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' : 'hover-surface hover-text-visible border-[rgb(var(--theme-border))]'}`}
                        style={!isLive ? { color: 'rgb(var(--theme-text-muted))' } : undefined}
                    >
                        <Radio className={`h-4 w-4 mr-2 ${isLive && isConnected ? 'animate-pulse' : ''}`} />
                        {isLive ? 'Live' : 'Go Live'}
                    </Button>

                    <TimeRangePicker value={timeRange} onChange={setTimeRange} />
                    <AutoRefreshSelector value={autoRefresh} onChange={setAutoRefresh} />

                    {/* Export Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 hover:opacity-90"
 style={{ borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Export
                                <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <DropdownMenuItem onClick={() => handleExport('csv')} style={{ color: 'rgb(var(--theme-text))' }} className="cursor-pointer hover:opacity-90">
                                Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('json')} style={{ color: 'rgb(var(--theme-text))' }} className="cursor-pointer hover:opacity-90">
                                Export as JSON
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Offline Alert - theme-aware contrast */}
            {isOffline && (
                <div
                    className="rounded-lg p-4 flex items-center gap-3 border"
                    style={{
                        background: theme === "light" ? "rgb(254 243 199)" : "rgb(245 158 11 / 0.15)",
                        borderColor: theme === "light" ? "rgb(217 119 6)" : "rgb(245 158 11 / 0.4)",
                    }}
                >
                    <AlertCircle className="h-5 w-5 shrink-0" style={{ color: theme === "light" ? "rgb(180 83 9)" : "rgb(251 191 36)" }} />
                    <div>
                        <p className="text-sm font-medium" style={{ color: theme === "light" ? "rgb(146 64 14)" : "rgb(251 191 36)" }}>Viewing Historical Data</p>
                        <p className="text-xs mt-0.5" style={{ color: theme === "light" ? "rgb(120 53 15)" : "rgb(251 191 36 / 0.9)" }}>
                            This node is offline. Showing historical data from ClickHouse.
                        </p>
                    </div>
                </div>
            )}

            {/* Actionable insights — compact stack, tuned borders (no heavy left rail) */}
            {analyticsData.insights.length > 0 && (
                <div className="max-w-3xl space-y-2">
                    {analyticsData.insights.map(
                        (insight: { type?: string; title: string; message: string }, idx: number) => {
                            const style = getInsightStyle(insight.type || "info");
                            const InsightIcon = style.icon;
                            return (
                                <div
                                    key={`${insight.title}-${idx}`}
                                    className={`flex gap-3 rounded-lg border px-4 py-3 ${style.wrap}`}
                                >
                                    <InsightIcon className={`mt-0.5 h-4 w-4 shrink-0 ${style.title}`} />
                                    <div className="min-w-0 space-y-1">
                                        <p className={`text-sm font-semibold ${style.title}`}>{insight.title}</p>
                                        <p className={`text-sm leading-snug ${style.body}`}>{insight.message}</p>
                                    </div>
                                </div>
                            );
                        }
                    )}
                </div>
            )}

            {/* Main Tabs - scrollable so Geo & Visitor Analytics are always reachable */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="overflow-x-auto pb-1 -mx-1 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
                    <TabsList className="p-1.5 h-auto inline-flex flex-nowrap gap-1 rounded-lg w-max min-w-full" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                        {[
                            { value: 'overview', label: 'Traffic', icon: LayoutDashboard },
                            { value: 'visitors', label: 'Visitors', icon: Users },
                            { value: 'geo', label: 'Geo', icon: Globe },
                            { value: 'traces', label: 'Traces', icon: Activity },
                        ].map(tab => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="analytics-tab-trigger flex items-center gap-2 px-4 py-2 transition-colors rounded-md hover:opacity-90 flex-shrink-0 text-[rgb(var(--theme-text-muted))]"
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {isLive ? (
                    <div className="space-y-4">
                        {activeTab === 'overview' && <TrafficDashboard />}
                        {activeTab !== 'overview' && (
                            <div 
                                className="p-12 text-center rounded-lg border-2 border-dashed"
                                style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
                            >
                                Real-time view not available for this tab.
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <TabsContent value="overview" className="mt-0 space-y-8">
                            <div className="max-w-6xl space-y-8">
                                <section className="space-y-3">
                                    <h2
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: "rgb(var(--theme-text-dim))" }}
                                    >
                                        Fleet snapshot
                                    </h2>
                                    <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        Summary for the selected time range and filters. Charts and time series stay on Monitoring.
                                    </p>
                                    {loading ? (
                                        <div className="space-y-4">
                                            <div
                                                className="h-14 animate-pulse rounded-xl border"
                                                style={{
                                                    background: "rgb(var(--theme-surface))",
                                                    borderColor: "rgb(var(--theme-border))",
                                                }}
                                            />
                                            <div
                                                className="h-[140px] animate-pulse rounded-xl border"
                                                style={{
                                                    background: "rgb(var(--theme-surface))",
                                                    borderColor: "rgb(var(--theme-border))",
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div
                                                className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3"
                                                style={{
                                                    background: "rgb(var(--theme-surface))",
                                                    borderColor: "rgb(var(--theme-border))",
                                                }}
                                            >
                                                <span
                                                    className="text-sm font-medium"
                                                    style={{ color: "rgb(var(--theme-text))" }}
                                                >
                                                    {(summary.total_requests ?? 0).toLocaleString()} requests
                                                </span>
                                                <span
                                                    className="text-xs"
                                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                                >
                                                    |
                                                </span>
                                                <span
                                                    className={`text-sm font-medium ${(summary.error_rate ?? 0) > 1 ? "text-red-500" : "text-emerald-500"}`}
                                                >
                                                    {(summary.error_rate ?? 0).toFixed(2)}% errors
                                                </span>
                                                <span
                                                    className="text-xs"
                                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                                >
                                                    |
                                                </span>
                                                <span
                                                    className="text-sm font-medium"
                                                    style={{ color: "rgb(var(--theme-text))" }}
                                                >
                                                    {Math.round(summary.avg_latency ?? 0)}ms avg
                                                </span>
                                                <span
                                                    className="text-xs"
                                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                                >
                                                    |
                                                </span>
                                                <span
                                                    className="text-sm"
                                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                                >
                                                    {formatBandwidth(summary.total_bandwidth ?? 0)}
                                                </span>
                                                {(analyticsData?.statusDistribution?.length ?? 0) > 0 && (
                                                    <>
                                                        <span
                                                            className="text-xs"
                                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                                        >
                                                            |
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {(analyticsData.statusDistribution || []).map(
                                                                (s: {
                                                                    code?: string;
                                                                    Code?: string;
                                                                    count?: number | string;
                                                                    Count?: number | string;
                                                                }) => {
                                                                    const code = s.code ?? s.Code ?? "";
                                                                    const count = s.count ?? s.Count ?? 0;
                                                                    const color = String(code).startsWith("2")
                                                                        ? "text-emerald-500"
                                                                        : String(code).startsWith("3")
                                                                          ? "text-blue-500"
                                                                          : String(code).startsWith("4")
                                                                            ? "text-amber-500"
                                                                            : "text-red-500";
                                                                    return (
                                                                        <button
                                                                            key={code}
                                                                            onClick={() => setDrillDownClass(String(code))}
                                                                            className={`font-mono text-xs ${color} hover:underline cursor-pointer`}
                                                                            title={`Click to drill down into ${code} responses`}
                                                                        >
                                                                            {code}:{Number(count).toLocaleString()}
                                                                        </button>
                                                                    );
                                                                }
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Status code drill-down panel */}
                                            <AnimatePresence>
                                                {drillDownClass && (
                                                    <StatusDrillDown
                                                        window={timeRange.value || "1h"}
                                                        agentId={selectedAgent}
                                                        initialClass={drillDownClass}
                                                        onClose={() => setDrillDownClass(null)}
                                                    />
                                                )}
                                            </AnimatePresence>

                                            {hasSparkData ? (
                                                <div
                                                    className="overflow-hidden rounded-xl border"
                                                    style={{
                                                        background: "rgb(var(--theme-surface))",
                                                        borderColor: "rgb(var(--theme-border))",
                                                    }}
                                                >
                                                    <div
                                                        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
                                                        style={{ borderColor: "rgb(var(--theme-border))" }}
                                                    >
                                                        <p
                                                            className="text-sm font-medium"
                                                            style={{ color: "rgb(var(--theme-text))" }}
                                                        >
                                                            Request rate
                                                        </p>
                                                        <p
                                                            className="text-xs"
                                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                                        >
                                                            Requests vs errors by bucket — full charts on Monitoring
                                                        </p>
                                                    </div>
                                                    <div className="h-[140px] w-full min-w-0 px-2 pb-2 pt-1">
                                                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                                            <AreaChart
                                                                data={requestRateSparkData}
                                                                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                                                            >
                                                                <defs>
                                                                    <linearGradient id="analyticsSparkReq" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor={chartColors.info} stopOpacity={0.35} />
                                                                        <stop offset="100%" stopColor={chartColors.info} stopOpacity={0} />
                                                                    </linearGradient>
                                                                    <linearGradient id="analyticsSparkErr" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor={chartColors.error} stopOpacity={0.35} />
                                                                        <stop offset="100%" stopColor={chartColors.error} stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" stroke={sparkGrid} vertical={false} />
                                                                <XAxis
                                                                    dataKey="time"
                                                                    tick={{ fontSize: 10, fill: sparkAxis }}
                                                                    tickLine={false}
                                                                    axisLine={{ stroke: sparkGrid }}
                                                                    interval="preserveStartEnd"
                                                                />
                                                                <YAxis
                                                                    width={36}
                                                                    tick={{ fontSize: 10, fill: sparkAxis }}
                                                                    tickLine={false}
                                                                    axisLine={false}
                                                                />
                                                                <Tooltip
                                                                    contentStyle={{
                                                                        backgroundColor: sparkTooltipBg,
                                                                        border: `1px solid ${sparkTooltipBorder}`,
                                                                        borderRadius: "0.5rem",
                                                                        color: sparkTooltipText,
                                                                        fontSize: "12px",
                                                                    }}
                                                                    labelStyle={{ color: sparkTooltipText }}
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="requests"
                                                                    name="Requests"
                                                                    stroke={chartColors.info}
                                                                    fill="url(#analyticsSparkReq)"
                                                                    strokeWidth={1.5}
                                                                    isAnimationActive={false}
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="errors"
                                                                    name="Errors"
                                                                    stroke={chartColors.error}
                                                                    fill="url(#analyticsSparkErr)"
                                                                    strokeWidth={1.5}
                                                                    isAnimationActive={false}
                                                                />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p
                                                    className="rounded-lg border px-4 py-3 text-sm"
                                                    style={{
                                                        background: "rgb(var(--theme-surface))",
                                                        borderColor: "rgb(var(--theme-border))",
                                                        color: "rgb(var(--theme-text-muted))",
                                                    }}
                                                >
                                                    No time-bucketed request data for this range. Try a wider window or check Monitoring →
                                                    Overview.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </section>

                                <section
                                    className="flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between"
                                    style={{
                                        background: "rgb(var(--theme-surface))",
                                        borderColor: "rgb(var(--theme-border))",
                                    }}
                                >
                                    <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        Request rates, status mix, top endpoints, and system charts are on{" "}
                                        <Link
                                            href="/monitoring"
                                            className="underline underline-offset-2 hover:opacity-90"
                                            style={{ color: "rgb(var(--theme-primary))" }}
                                        >
                                            Monitoring → Overview
                                        </Link>
                                        .
                                    </p>
                                    <Button variant="outline" size="sm" className="h-9 shrink-0 self-start sm:self-auto" asChild>
                                        <Link href="/monitoring">
                                            <LayoutDashboard className="mr-2 h-4 w-4" />
                                            Open Monitoring
                                        </Link>
                                    </Button>
                                </section>

                                {/* Latency Percentiles + Top Endpoints */}
                                <section className="grid gap-4 lg:grid-cols-2">
                                    {/* P50/P95/P99 Latency Chart */}
                                    {(analyticsData.latencyTrend?.length || 0) > 0 && (
                                        <div className="rounded-xl border p-5" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                                            <h3 className="text-sm font-medium mb-3" style={{ color: "rgb(var(--theme-text))" }}>Latency Percentiles</h3>
                                            <div className="h-[200px]">
                                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                                    <AreaChart data={analyticsData.latencyTrend}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="time" stroke="rgb(var(--theme-text-muted))" fontSize={11} tickLine={false} />
                                                        <YAxis stroke="rgb(var(--theme-text-muted))" fontSize={11} tickLine={false} unit="ms" />
                                                        <Tooltip contentStyle={{ backgroundColor: "rgb(var(--theme-surface))", border: "1px solid rgb(var(--theme-border))", borderRadius: 8, color: "rgb(var(--theme-text))" }} />
                                                        <Area type="monotone" dataKey="p99" stroke="#ef4444" fill="#ef4444" fillOpacity={0.05} strokeWidth={1.5} name="P99" dot={false} />
                                                        <Area type="monotone" dataKey="p95" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={1.5} name="P95" dot={false} />
                                                        <Area type="monotone" dataKey="p50" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} name="P50" dot={false} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    {/* Top Endpoints */}
                                    {(analyticsData.topEndpoints?.length || 0) > 0 && (
                                        <div className="rounded-xl border p-5" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                                            <h3 className="text-sm font-medium mb-3" style={{ color: "rgb(var(--theme-text))" }}>Top Endpoints</h3>
                                            <div className="space-y-2">
                                                {analyticsData.topEndpoints.slice(0, 6).map((e: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between py-1.5">
                                                        <span className="font-mono text-xs truncate max-w-[250px]" style={{ color: "rgb(var(--theme-text))" }} title={e.uri}>{e.uri}</span>
                                                        <div className="flex items-center gap-3 shrink-0 ml-3">
                                                            <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{parseInt(e.requests).toLocaleString()}</span>
                                                            <span className={`text-xs font-medium ${parseFloat(e.p95) > 200 ? 'text-amber-500' : ''}`}>{Math.round(parseFloat(e.p95 || 0))}ms</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent value="visitors" className="space-y-6 mt-6">
                            <VisitorAnalyticsContent />
                        </TabsContent>

                        <TabsContent value="geo" className="space-y-6 mt-6">
                            <GeoAnalyticsContent />
                        </TabsContent>

                        <TabsContent value="traces" className="space-y-6 mt-6">
                            <TracesContent />
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin" style={{ color: 'rgb(var(--theme-text-muted))' }} />
            </div>
        }>
            <AnalyticsContent />
        </Suspense>
    );
}
