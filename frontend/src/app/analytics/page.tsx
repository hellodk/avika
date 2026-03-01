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
    Gauge, Wifi, HardDrive, Database, LayoutDashboard, Filter
} from "lucide-react";
import { 
    Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, 
    XAxis, YAxis, CartesianGrid, Legend, Area, AreaChart, Pie, PieChart, Cell 
} from "recharts";
import { TimeRangePicker, TimeRange } from "@/components/ui/time-range-picker";
import { AutoRefreshSelector, AutoRefreshConfig } from "@/components/ui/auto-refresh-selector";
import { SystemMetricCards, NginxMetricCards } from "@/components/analytics/metric-cards";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LiveMetricsProvider, useLiveMetrics } from "@/components/analytics/LiveMetricsProvider";
import { SystemDashboard } from "@/components/analytics/dashboards/SystemDashboard";
import { TrafficDashboard } from "@/components/analytics/dashboards/TrafficDashboard";
import { NginxCoreDashboard } from "@/components/analytics/dashboards/NginxCoreDashboard";
import { AlertConfiguration } from "@/components/alerts/AlertConfiguration";
import { useTheme } from "@/lib/theme-provider";
import { getChartColorsForTheme, getHttpStatusColor } from "@/lib/chart-colors";
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
    const trendColor = trend === "up" ? "text-emerald-300" : trend === "down" ? "text-red-300" : "text-slate-300";
    const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;

    return (
        <Card className="border" style={{ background: "rgb(30, 41, 59)", borderColor: "rgb(71, 85, 105)" }}>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-300">
                            {title}
                        </p>
                        <p className="text-2xl font-bold text-white">
                            {value}
                        </p>
                        {(delta !== undefined || subtitle) && (
                            <div className="flex items-center gap-1 mt-1">
                                {TrendIcon && <TrendIcon className={`h-3 w-3 ${trendColor}`} />}
                                <span className={`text-xs font-medium ${delta !== undefined ? trendColor : 'text-slate-400'}`}>
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
                const res = await apiFetch(`/api/analytics?${queryParams}${agentParam}`);
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
    }, [timeRange, autoRefresh, selectedAgent]);

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

    const formatTimeForDisplay = (timeStr: string) => {
        if (!timeStr) return timeStr;
        if (timezone === 'Browser') {
            if (timeStr.match(/^\d{2}:\d{2}$/)) {
                const now = new Date();
                const [hours, minutes] = timeStr.split(':').map(Number);
                const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
                return utcDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
        }
        return timeStr;
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
        const url = `/api/analytics/export?format=${format}&window=${timeRange.value}&agent_id=${selectedAgent}`;
        window.open(url, '_blank');
    };

    const selectedAgentData = agents.find((a: any) => (a.agent_id || a.id) === selectedAgent);
    const isOffline = selectedAgentData?.status === 'offline';

    // Insights styling helper - HIGH VISIBILITY
    const getInsightStyle = (type: string) => {
        switch (type) {
            case 'critical':
                return { bg: 'bg-red-500/20', border: 'border-l-red-400', text: 'text-red-300', icon: AlertCircle };
            case 'warning':
                return { bg: 'bg-amber-500/20', border: 'border-l-amber-400', text: 'text-amber-300', icon: TrendingUp };
            default:
                return { bg: 'bg-blue-500/20', border: 'border-l-blue-400', text: 'text-blue-300', icon: Activity };
        }
    };

    return (
        <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white">
                        Analytics
                    </h1>
                    <p className="text-sm mt-1 text-slate-300">
                        Comprehensive metrics and insights across your NGINX fleet
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Agent Selector */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-800 border-slate-600">
                        <Server className="h-4 w-4 text-slate-400" />
                        <select
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            className="text-sm font-medium bg-transparent border-none focus:ring-0 cursor-pointer pr-6 text-white"
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
                        className="h-9 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                    >
                        <Globe className="h-4 w-4 mr-2" />
                        {timezone}
                    </Button>

                    {/* Live Mode Toggle */}
                    <Button
                        variant={isLive ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsLive(!isLive)}
                        className={`h-9 ${isLive ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' : 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
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
                                className="h-9 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Export
                                <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-800 border-slate-600">
                            <DropdownMenuItem onClick={() => handleExport('csv')} className="text-slate-200 hover:text-white hover:bg-slate-700 cursor-pointer">
                                Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('json')} className="text-slate-200 hover:text-white hover:bg-slate-700 cursor-pointer">
                                Export as JSON
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Offline Alert */}
            {isOffline && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-amber-400">Viewing Historical Data</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">
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
                                className={`${style.bg} border-l-4 ${style.border}`}
                                style={{ borderColor: "rgb(var(--theme-border))", borderLeftColor: undefined }}
                            >
                                <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                                    <CardTitle className={`text-sm font-semibold ${style.text}`}>
                                        {insight.title}
                                    </CardTitle>
                                    <InsightIcon className={`h-4 w-4 ${style.text}`} />
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-300">
                                        {insight.message}
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <TabsList className="p-1.5 h-auto flex flex-wrap gap-1 bg-slate-800/80 border border-slate-600 rounded-lg">
                    {[
                        { value: 'overview', label: 'Overview', icon: LayoutDashboard },
                        { value: 'gateway', label: 'Gateway', icon: Database },
                        { value: 'performance', label: 'Performance', icon: Gauge },
                        { value: 'system', label: 'System', icon: HardDrive },
                        { value: 'errors', label: 'Errors', icon: AlertCircle },
                        { value: 'traffic', label: 'Traffic', icon: Wifi },
                        { value: 'alerts', label: 'Alerts', icon: Activity },
                    ].map(tab => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="flex items-center gap-2 px-4 py-2 text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:text-slate-200 transition-all rounded-md"
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {isLive ? (
                    <div className="space-y-4">
                        {activeTab === 'overview' && <TrafficDashboard />}
                        {activeTab === 'traffic' && <TrafficDashboard />}
                        {activeTab === 'alerts' && <AlertConfiguration />}
                        {(activeTab === 'system' || activeTab === 'performance') && <SystemDashboard />}
                        {activeTab === 'gateway' && <TrafficDashboard />}
                        {(!['overview', 'traffic', 'system', 'performance', 'gateway', 'alerts'].includes(activeTab)) && (
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
                        {/* OVERVIEW TAB */}
                        <TabsContent value="overview" className="space-y-6">
                            {/* NGINX Metrics */}
                            <NginxMetricCards data={analyticsData.connections_history.length > 0 ? {
                                active_connections: analyticsData.connections_history[analyticsData.connections_history.length - 1].active,
                                waiting: analyticsData.connections_history[analyticsData.connections_history.length - 1].waiting,
                                requests_per_second: analyticsData.connections_history[analyticsData.connections_history.length - 1].requests,
                                total_requests: summary.total_requests
                            } : null} />

                            {/* KPI Cards */}
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <KPICard
                                    title="Total Requests"
                                    value={summary.total_requests >= 1000000 
                                        ? (summary.total_requests / 1000000).toFixed(2) + "M" 
                                        : summary.total_requests >= 1000 
                                            ? (summary.total_requests / 1000).toFixed(1) + "K" 
                                            : summary.total_requests}
                                    delta={summary.requests_delta}
                                    deltaLabel="from prev period"
                                    icon={BarChart3}
                                    iconColor="blue"
                                    trend={summary.requests_delta >= 0 ? "up" : "down"}
                                />
                                <KPICard
                                    title="Avg Latency"
                                    value={`${Math.round(summary.avg_latency)}ms`}
                                    delta={Math.round(summary.latency_delta)}
                                    deltaLabel="ms from prev"
                                    icon={Clock}
                                    iconColor={summary.avg_latency > 200 ? "amber" : "green"}
                                    trend={summary.latency_delta <= 0 ? "up" : "down"}
                                />
                                <KPICard
                                    title="Error Rate"
                                    value={`${summary.error_rate.toFixed(2)}%`}
                                    delta={parseFloat(summary.error_rate_delta.toFixed(2))}
                                    deltaLabel="% from prev"
                                    icon={AlertCircle}
                                    iconColor={summary.error_rate > 5 ? "red" : summary.error_rate > 1 ? "amber" : "green"}
                                    trend={summary.error_rate_delta <= 0 ? "up" : "down"}
                                />
                                <KPICard
                                    title="Bandwidth"
                                    value={formatBandwidth(summary.total_bandwidth)}
                                    subtitle="in selected window"
                                    icon={Wifi}
                                    iconColor="purple"
                                />
                            </div>

                            {/* Request Rate Chart */}
                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Request Rate & Errors
                                    </CardTitle>
                                    <CardDescription className="text-slate-300">
                                        Traffic volume and error trends over time
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        {loading ? (
                                            <div className="h-full flex items-center justify-center">
                                                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={requestData}>
                                                    <defs>
                                                        <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={chartColors.info} stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor={chartColors.info} stopOpacity={0}/>
                                                        </linearGradient>
                                                        <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={chartColors.error} stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor={chartColors.error} stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                    <Legend />
                                                    <Area type="monotone" dataKey="requests" stroke={chartColors.info} fill="url(#requestGradient)" strokeWidth={2} name="Requests" />
                                                    <Area type="monotone" dataKey="errors" stroke={chartColors.error} fill="url(#errorGradient)" strokeWidth={2} name="Errors" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Status & Server Distribution */}
                            <div className="grid gap-4 lg:grid-cols-2">
                                {/* HTTP Status Distribution */}
                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            HTTP Status Distribution
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[280px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={statusChartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        labelLine={false}
                                                        label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                                                        outerRadius={90}
                                                        innerRadius={50}
                                                        fill="#8884d8"
                                                        dataKey="value"
                                                        stroke="rgb(var(--theme-background))"
                                                        strokeWidth={2}
                                                    >
                                                        {statusChartData.map((entry: any, index: number) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Server Distribution */}
                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            Server Load Distribution
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {analyticsData.server_distribution.length > 0 ? (
                                                analyticsData.server_distribution.slice(0, 5).map((s: any, idx: number) => (
                                                    <div key={idx} className="space-y-2">
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="font-medium truncate max-w-[200px] text-white">
                                                                {s.hostname}
                                                            </span>
                                                            <span className="text-slate-300">
                                                                {s.requests.toLocaleString()} reqs
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-2 rounded-full overflow-hidden bg-slate-700">
                                                            <div
                                                                className="h-full bg-blue-500 rounded-full transition-all"
                                                                style={{ width: `${Math.min((s.requests / summary.total_requests * 100) || 0, 100)}%` }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                                            <span>{formatBandwidth(s.traffic)}</span>
                                                            <span className={s.error_rate > 5 ? "text-red-400" : ""}>
                                                                {s.error_rate.toFixed(1)}% errors
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 text-slate-400">
                                                    No server distribution data available
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* GATEWAY TAB */}
                        <TabsContent value="gateway" className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <KPICard
                                    title="Gateway EPS"
                                    value={(() => {
                                        const metrics = analyticsData.gateway_metrics || [];
                                        const maxEps = metrics.reduce((max: number, curr: any) => Math.max(max, Number(curr.eps || 0)), 0);
                                        return maxEps > 0 ? maxEps.toFixed(1) : "0";
                                    })()}
                                    subtitle="Peak events/second"
                                    icon={Zap}
                                    iconColor="blue"
                                />
                                <KPICard
                                    title="Active Streams"
                                    value={(analyticsData.gateway_metrics?.length || 0) > 0
                                        ? analyticsData.gateway_metrics[analyticsData.gateway_metrics.length - 1].active_connections || 0
                                        : 0}
                                    subtitle="Agent gRPC connections"
                                    icon={Wifi}
                                    iconColor="green"
                                />
                                <KPICard
                                    title="DB Latency"
                                    value={`${(analyticsData.gateway_metrics?.length || 0) > 0
                                        ? Number(analyticsData.gateway_metrics[analyticsData.gateway_metrics.length - 1].db_latency || 0).toFixed(2)
                                        : 0}ms`}
                                    subtitle="ClickHouse insert avg"
                                    icon={Database}
                                    iconColor="amber"
                                />
                                <KPICard
                                    title="Memory"
                                    value={`${(analyticsData.gateway_metrics?.length || 0) > 0
                                        ? Number(analyticsData.gateway_metrics[analyticsData.gateway_metrics.length - 1].memory_mb || 0).toFixed(0)
                                        : 0}MB`}
                                    subtitle="Gateway heap usage"
                                    icon={HardDrive}
                                    iconColor="purple"
                                />
                            </div>

                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Message Rate (EPS)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={analyticsData.gateway_metrics}>
                                                <defs>
                                                    <linearGradient id="epsGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColors.info} stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor={chartColors.info} stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ 
                                                        backgroundColor: tooltipBg, 
                                                        border: `1px solid ${tooltipBorder}`, 
                                                        borderRadius: "0.5rem", 
                                                        color: tooltipText 
                                                    }}
                                                />
                                                <Area type="monotone" dataKey="eps" stroke={chartColors.info} fill="url(#epsGradient)" strokeWidth={2} name="EPS" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            Resource Usage
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[260px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={analyticsData.gateway_metrics}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="cpu_usage" stroke={chartColors.cpu} strokeWidth={2} name="CPU %" dot={false} />
                                                    <Line type="monotone" dataKey="memory_mb" stroke={chartColors.memory} strokeWidth={2} name="Memory MB" dot={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            DB Latency Trend
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[260px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={analyticsData.gateway_metrics}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} unit="ms" />
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                    <Line type="monotone" dataKey="db_latency" stroke={chartColors.success} strokeWidth={2} name="Latency (ms)" dot={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* PERFORMANCE TAB */}
                        <TabsContent value="performance" className="space-y-6">
                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Latency Percentiles
                                    </CardTitle>
                                    <CardDescription className="text-slate-300">
                                        P50, P95, and P99 response times over the selected period
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={analyticsData.latencyTrend}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} unit="ms" />
                                                <Tooltip
                                                    contentStyle={{ 
                                                        backgroundColor: tooltipBg, 
                                                        border: `1px solid ${tooltipBorder}`, 
                                                        borderRadius: "0.5rem", 
                                                        color: tooltipText 
                                                    }}
                                                />
                                                <Legend />
                                                <Line type="monotone" dataKey="p50" stroke={chartColors.latencyP50} strokeWidth={2} name="P50" dot={false} />
                                                <Line type="monotone" dataKey="p95" stroke={chartColors.latencyP95} strokeWidth={2} name="P95" dot={false} />
                                                <Line type="monotone" dataKey="p99" stroke={chartColors.latencyP99} strokeWidth={2} name="P99" dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Latency Distribution
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={analyticsData.latency_distribution}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                <XAxis dataKey="bucket" stroke={axisColor} fontSize={12} tickLine={false} />
                                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ 
                                                        backgroundColor: tooltipBg, 
                                                        border: `1px solid ${tooltipBorder}`, 
                                                        borderRadius: "0.5rem", 
                                                        color: tooltipText 
                                                    }}
                                                />
                                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                                    {analyticsData.latency_distribution.map((entry: any, index: number) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={
                                                                entry.bucket.includes('500ms') || entry.bucket.includes('1s') ? chartColors.latencyP99 :
                                                                entry.bucket.includes('200ms') || entry.bucket.includes('300ms') ? chartColors.latencyP95 :
                                                                chartColors.latencyP50
                                                            }
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Slowest Endpoints */}
                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Slowest Endpoints
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-600">
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('uri')}>
                                                    Endpoint
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('avgLatency')}>
                                                    Avg Latency
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('p95')}>
                                                    P95
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('requests')}>
                                                    Requests
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedEndpoints.slice(0, 5).map((endpoint, idx) => (
                                                <TableRow key={idx} className="border-slate-600">
                                                    <TableCell className="font-mono text-sm text-white">
                                                        {endpoint.uri}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={
                                                            endpoint.avgLatency > 150 ? "bg-red-500/15 text-red-400 border-red-500/30" : 
                                                            endpoint.avgLatency > 100 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : 
                                                            "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                        }>
                                                            {endpoint.avgLatency}ms
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-slate-300">{endpoint.p95}ms</TableCell>
                                                    <TableCell className="text-slate-300">{endpoint.requests.toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ERRORS TAB */}
                        <TabsContent value="errors" className="space-y-6">
                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Error Rate Over Time
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={requestData}>
                                                <defs>
                                                    <linearGradient id="errorAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColors.error} stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor={chartColors.error} stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ 
                                                        backgroundColor: tooltipBg, 
                                                        border: `1px solid ${tooltipBorder}`, 
                                                        borderRadius: "0.5rem", 
                                                        color: tooltipText 
                                                    }}
                                                />
                                                <Area type="monotone" dataKey="errors" stroke={chartColors.error} fill="url(#errorAreaGradient)" strokeWidth={2} name="Errors" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Error-Prone Endpoints
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-600">
                                                <TableHead className="text-slate-300">Endpoint</TableHead>
                                                <TableHead className="text-slate-300">Total Errors</TableHead>
                                                <TableHead className="text-slate-300">Error Rate</TableHead>
                                                <TableHead className="text-slate-300">Requests</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedEndpoints.filter(e => e.errors > 0).slice(0, 5).map((endpoint, idx) => (
                                                <TableRow key={idx} className="border-slate-600">
                                                    <TableCell className="font-mono text-sm text-white">
                                                        {endpoint.uri}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
                                                            {endpoint.errors}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-slate-300">
                                                        {((endpoint.errors / endpoint.requests) * 100).toFixed(2)}%
                                                    </TableCell>
                                                    <TableCell className="text-slate-300">
                                                        {endpoint.requests.toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {sortedEndpoints.filter(e => e.errors > 0).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-8 text-slate-400">
                                                        No errors recorded in the selected time range
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* SYSTEM TAB */}
                        <TabsContent value="system" className="space-y-6">
                            <SystemMetricCards data={analyticsData.system_metrics.length > 0 ? {
                                cpu_usage_percent: analyticsData.system_metrics[analyticsData.system_metrics.length - 1].cpuUsage,
                                memory_usage_percent: analyticsData.system_metrics[analyticsData.system_metrics.length - 1].memoryUsage,
                                network_rx_rate: analyticsData.system_metrics[analyticsData.system_metrics.length - 1].networkRxRate,
                                network_tx_rate: analyticsData.system_metrics[analyticsData.system_metrics.length - 1].networkTxRate
                            } : null} />

                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            CPU Usage
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[280px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={analyticsData.system_metrics}>
                                                    <defs>
                                                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                    <Area type="monotone" dataKey="cpuUsage" stroke="#818cf8" fill="url(#cpuGradient)" strokeWidth={2} name="CPU %" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-slate-800 border-slate-600">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white">
                                            Memory Usage
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[280px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={analyticsData.system_metrics}>
                                                    <defs>
                                                        <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={chartColors.memory} stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor={chartColors.memory} stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                                                    <Tooltip
                                                        contentStyle={{ 
                                                            backgroundColor: tooltipBg, 
                                                            border: `1px solid ${tooltipBorder}`, 
                                                            borderRadius: "0.5rem", 
                                                            color: tooltipText 
                                                        }}
                                                    />
                                                    <Area type="monotone" dataKey="memoryUsage" stroke={chartColors.memory} fill="url(#memGradient)" strokeWidth={2} name="Memory %" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Network Throughput
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={analyticsData.system_metrics}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                <XAxis dataKey="time" stroke={axisColor} fontSize={12} tickLine={false} />
                                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ 
                                                        backgroundColor: tooltipBg, 
                                                        border: `1px solid ${tooltipBorder}`, 
                                                        borderRadius: "0.5rem", 
                                                        color: tooltipText 
                                                    }}
                                                />
                                                <Legend />
                                                <Line type="monotone" dataKey="networkRxRate" stroke={chartColors.networkRx} strokeWidth={2} name="RX Rate" dot={false} />
                                                <Line type="monotone" dataKey="networkTxRate" stroke={chartColors.networkTx} strokeWidth={2} name="TX Rate" dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TRAFFIC TAB */}
                        <TabsContent value="traffic" className="space-y-6">
                            <Card className="bg-slate-800 border-slate-600">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-white">
                                        Top URLs by Traffic
                                    </CardTitle>
                                    <CardDescription className="text-slate-300">
                                        Most requested endpoints sorted by volume
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-600">
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('uri')}>
                                                    URL Path
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('requests')}>
                                                    Requests
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('traffic')}>
                                                    Bandwidth
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('avgLatency')}>
                                                    Avg Latency
                                                </TableHead>
                                                <TableHead className="text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('errors')}>
                                                    Errors
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedEndpoints.map((stat, idx) => (
                                                <TableRow key={idx} className="border-slate-600">
                                                    <TableCell className="font-mono text-sm max-w-[300px] truncate text-white">
                                                        {stat.uri}
                                                    </TableCell>
                                                    <TableCell className="text-slate-300">
                                                        {stat.requests.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-slate-300">
                                                        {stat.traffic}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={
                                                            stat.avgLatency > 150 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : 
                                                            "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                        }>
                                                            {stat.avgLatency}ms
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.errors > 0 ? (
                                                            <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
                                                                {stat.errors}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {sortedEndpoints.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                                                        No traffic data available for the selected period
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ALERTS TAB */}
                        <TabsContent value="alerts" className="space-y-6">
                            <AlertConfiguration />
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
                <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        }>
            <AnalyticsContent />
        </Suspense>
    );
}
