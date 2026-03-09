"use client";

import { useState, useEffect, Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    BarChart3, TrendingUp, AlertCircle, Activity, Clock, Globe, Server, 
    Radio, Download, ChevronDown, RefreshCw, Zap, ArrowUpRight, ArrowDownRight,
    Wifi, LayoutDashboard, Filter, Users
} from "lucide-react";
import { 
    Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, 
    XAxis, YAxis, CartesianGrid, Legend, Area, AreaChart, Pie, PieChart, Cell 
} from "recharts";
import { TimeRangePicker, TimeRange } from "@/components/ui/time-range-picker";
import { AutoRefreshSelector, AutoRefreshConfig } from "@/components/ui/auto-refresh-selector";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const VisitorAnalyticsContent = dynamic(
    () => import("@/app/analytics/visitors/page").then((m) => ({ default: m.default })),
    { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin" style={{ color: "rgb(var(--theme-text-muted))" }} /></div> }
);
const GeoAnalyticsContent = dynamic(
    () => import("@/app/analytics/geo/page").then((m) => ({ default: m.default })),
    { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin" style={{ color: "rgb(var(--theme-text-muted))" }} /></div> }
);
import { LiveMetricsProvider, useLiveMetrics } from "@/components/analytics/LiveMetricsProvider";
import { TrafficDashboard } from "@/components/analytics/dashboards/TrafficDashboard";
import { NginxCoreDashboard } from "@/components/analytics/dashboards/NginxCoreDashboard";
import { useTheme } from "@/lib/theme-provider";
import { getChartColorsForTheme, getHttpStatusColor } from "@/lib/chart-colors";
import { useProject } from "@/lib/project-context";
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

// KPI Card Component - HIGH VISIBILITY VERSION
function KPICard({ 
    title, 
    value, 
    subtitle, 
    delta, 
    deltaLabel,
    icon: Icon, 
    iconColor = "blue",
    trend 
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    delta?: number;
    deltaLabel?: string;
    icon: any;
    iconColor?: string;
    trend?: "up" | "down" | "neutral";
}) {
    // BRIGHT, HIGH CONTRAST COLORS
    const colorMap: Record<string, { bg: string; text: string }> = {
        blue: { bg: "bg-blue-500/20", text: "text-blue-300" },
        green: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
        amber: { bg: "bg-amber-500/20", text: "text-amber-300" },
        red: { bg: "bg-red-500/20", text: "text-red-300" },
        purple: { bg: "bg-purple-500/20", text: "text-purple-300" },
        indigo: { bg: "bg-indigo-500/20", text: "text-indigo-300" }
    };

    const colors = colorMap[iconColor] || colorMap.blue;
    
    // Bright trend colors
    const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "";
    const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;

    return (
        <Card className="border" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                            {title}
                        </p>
                        <p className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
                            {value}
                        </p>
                        {(delta !== undefined || subtitle) && (
                            <div className="flex items-center gap-1 mt-1">
                                {TrendIcon && <TrendIcon className={`h-3 w-3 ${trendColor}`} />}
                                <span
                                    className={`text-xs font-medium ${delta !== undefined ? trendColor : ""}`}
                                    style={delta === undefined ? { color: "rgb(var(--theme-text-muted))" } : undefined}
                                >
                                    {delta !== undefined ? `${delta >= 0 ? '+' : ''}${delta}` : ''} {deltaLabel || subtitle}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className={`p-3 rounded-lg ${colors.bg}`}>
                        <Icon className={`h-5 w-5 ${colors.text}`} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

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

    // Theme-aware chart colors (WCAG compliant)
    const chartColors = getChartColorsForTheme(theme);
    const gridColor = chartColors.grid;
    const axisColor = chartColors.axis;
    const tooltipBg = chartColors.tooltipBg;
    const tooltipText = chartColors.tooltipText;
    const tooltipBorder = chartColors.tooltipBorder;

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
    const [agents, setAgents] = useState<any[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [loading, setLoading] = useState(true);
    const [analyticsData, setAnalyticsData] = useState<any>(initialData);

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
    
    const formatBandwidth = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    // Comprehensive time format conversion for browser timezone
    const formatTimeForDisplay = (timeStr: string) => {
        if (!timeStr) return timeStr;
        if (timezone !== 'Browser') return timeStr;

        try {
            // Pattern: HH:MM (e.g., "14:30")
            if (timeStr.match(/^\d{2}:\d{2}$/)) {
                const now = new Date();
                const [hours, minutes] = timeStr.split(':').map(Number);
                const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
                return utcDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            // Pattern: MM-DD HH:MM (e.g., "03-01 14:30")
            if (timeStr.match(/^\d{2}-\d{2} \d{2}:\d{2}$/)) {
                const now = new Date();
                const [datePart, timePart] = timeStr.split(' ');
                const [month, day] = datePart.split('-').map(Number);
                const [hours, minutes] = timePart.split(':').map(Number);
                const utcDate = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hours, minutes));
                return utcDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
                       utcDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            // Pattern: MM-DD HH:00 (e.g., "03-01 14:00")
            if (timeStr.match(/^\d{2}-\d{2} \d{2}:00$/)) {
                const now = new Date();
                const [datePart, timePart] = timeStr.split(' ');
                const [month, day] = datePart.split('-').map(Number);
                const hours = parseInt(timePart.split(':')[0]);
                const utcDate = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hours, 0));
                return utcDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
                       utcDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            // Pattern: YYYY-MM-DD HH:MM (e.g., "2026-03-01 14:30")
            if (timeStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
                const utcDate = new Date(timeStr + ':00Z');
                return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
                       utcDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            // Pattern: YYYY-MM-DD (e.g., "2026-03-01")
            if (timeStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const utcDate = new Date(timeStr + 'T00:00:00Z');
                return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
            }
        } catch (e) {
            console.error('Time format conversion error:', e);
        }

        return timeStr;
    };

    // Get timezone label for display
    const getTimezoneLabel = () => {
        if (timezone === 'Browser') {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
        return 'UTC';
    };

    // Get previous period label based on time range
    const getPrevPeriodLabel = () => {
        const value = timeRange.value || '24h';
        const labels: Record<string, string> = {
            '5m': 'vs prev 5m',
            '15m': 'vs prev 15m',
            '30m': 'vs prev 30m',
            '1h': 'vs prev hour',
            '3h': 'vs prev 3h',
            '6h': 'vs prev 6h',
            '12h': 'vs prev 12h',
            '24h': 'vs yesterday',
            '2d': 'vs prev 2d',
            '7d': 'vs prev week',
            '30d': 'vs prev month',
        };
        return labels[value] || 'vs previous';
    };

    const requestData = analyticsData.requestRate.map((p: any) => ({
        time: formatTimeForDisplay(p.time),
        requests: parseInt(p.requests),
        errors: parseInt(p.errors)
    }));

    // Theme-aware status colors for pie chart
    const statusChartData = analyticsData.statusDistribution.map((s: any) => ({
        name: s.code,
        value: parseInt(s.count),
        color: getHttpStatusColor(s.code, theme as any)
    }));

    const endpointData = analyticsData.topEndpoints.map((e: any) => ({
        uri: e.uri,
        requests: parseInt(e.requests),
        errors: parseInt(e.errors),
        p95: e.p95,
        avgLatency: Math.round(e.p95 / 1.5),
        traffic: e.traffic
    }));

    const toggleTimezone = () => {
        setTimezone(prev => prev === 'UTC' ? 'Browser' : 'UTC');
    };

    const sortData = (data: any[], key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return [...data].sort((a, b) => (a[key] > b[key] ? -1 : 1));
        }
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            return [...data].sort((a, b) => (a[key] > b[key] ? 1 : -1));
        }
        return data;
    };

    const getSortedEndpoints = () => {
        return sortData(endpointData, sortConfig?.key || 'requests');
    };

    const sortedEndpoints = getSortedEndpoints();

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
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

    const selectedAgentData = agents.find((a: any) => (a.agent_id || a.id) === selectedAgent);
    const isOffline = selectedAgentData?.status === 'offline';

    // Insights styling helper - theme-aware for contrast (light: dark text on tinted bg; dark: bright text on tinted bg)
    const isLight = theme === "light";
    const getInsightStyle = (type: string) => {
        switch (type) {
            case 'critical':
                return isLight
                    ? { bg: 'bg-red-100', border: 'border-l-red-600', text: 'text-red-800', icon: AlertCircle }
                    : { bg: 'bg-red-500/20', border: 'border-l-red-400', text: 'text-red-300', icon: AlertCircle };
            case 'warning':
                return isLight
                    ? { bg: 'bg-amber-100', border: 'border-l-amber-600', text: 'text-amber-800', icon: TrendingUp }
                    : { bg: 'bg-amber-500/20', border: 'border-l-amber-400', text: 'text-amber-300', icon: TrendingUp };
            default:
                return isLight
                    ? { bg: 'bg-blue-100', border: 'border-l-blue-600', text: 'text-blue-800', icon: Activity }
                    : { bg: 'bg-blue-500/20', border: 'border-l-blue-400', text: 'text-blue-300', icon: Activity };
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
                            {agents.map((agent: any) => (
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

            {/* Actionable Insights */}
            {analyticsData.insights.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                    {analyticsData.insights.map((insight: any, idx: number) => {
                        const style = getInsightStyle(insight.type);
                        const InsightIcon = style.icon;
                        return (
                            <Card 
                                key={idx} 
                                className={`border-l-4 ${style.border} ${style.bg}`}
                                style={{ borderColor: "rgb(var(--theme-border))" }}
                            >
                                <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                                    <CardTitle className={`text-sm font-semibold ${style.text}`}>
                                        {insight.title}
                                    </CardTitle>
                                    <InsightIcon className={`h-4 w-4 ${style.text}`} />
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                        {insight.message}
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Main Tabs - scrollable so Geo & Visitor Analytics are always reachable */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="overflow-x-auto pb-1 -mx-1 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
                    <TabsList className="p-1.5 h-auto inline-flex flex-nowrap gap-1 rounded-lg w-max min-w-full" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                        {[
                            { value: 'overview', label: 'Overview', icon: LayoutDashboard },
                            { value: 'visitors', label: 'Visitor Analytics', icon: Users },
                            { value: 'geo', label: 'Geo', icon: Globe },
                        ].map(tab => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="analytics-tab-trigger flex items-center gap-2 px-4 py-2 data-[state=active]:shadow-md transition-all rounded-md hover:opacity-90 flex-shrink-0"
                                style={{ color: 'rgb(var(--theme-text-muted))' }}
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
                        {/* OVERVIEW TAB - Key metrics moved to Monitoring > Overview */}
                        <TabsContent value="overview" className="space-y-6">
                            <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Key metrics and charts are on <Link href="/monitoring" className="underline hover:opacity-90" style={{ color: 'rgb(var(--theme-primary))' }}>Monitoring → Overview</Link>. Use the tabs above for detailed analytics.
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => handleTabChange("visitors")}
                                    className="flex items-center gap-4 p-4 rounded-lg border-2 transition-colors hover:border-blue-500/50 text-left w-full"
                                    style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                                >
                                    <div className="p-2 rounded-lg" style={{ background: 'rgba(var(--theme-primary), 0.15)' }}>
                                        <Users className="h-6 w-6" style={{ color: 'rgb(var(--theme-primary))' }} />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Visitor Analytics</p>
                                        <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>Browsers, devices, referrers, status codes (GoAccess-style)</p>
                                    </div>
                                    <ArrowUpRight className="h-4 w-4 ml-auto flex-shrink-0" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange("geo")}
                                    className="flex items-center gap-4 p-4 rounded-lg border-2 transition-colors hover:border-blue-500/50 text-left w-full"
                                    style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                                >
                                    <div className="p-2 rounded-lg" style={{ background: 'rgba(var(--theme-primary), 0.15)' }}>
                                        <Globe className="h-6 w-6" style={{ color: 'rgb(var(--theme-primary))' }} />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Geo Analytics</p>
                                        <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>Traffic by country and city</p>
                                    </div>
                                    <ArrowUpRight className="h-4 w-4 ml-auto flex-shrink-0" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                                </button>
                            </div>
                        </TabsContent>

                        <TabsContent value="visitors" className="space-y-6 mt-6">
                            <VisitorAnalyticsContent />
                        </TabsContent>

                        <TabsContent value="geo" className="space-y-6 mt-6">
                            <GeoAnalyticsContent />
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
