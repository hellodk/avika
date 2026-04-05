'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { apiFetch } from "@/lib/api";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Tooltip as UITooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshButton } from "@/components/ui/refresh-button";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import {
    Activity, Cpu, Server, Network, Wifi, AlertTriangle, CheckCircle,
    RefreshCw, Shield, Clock, Zap, ArrowUpRight, ArrowDownRight,
    Settings, Terminal, Database, Loader2, TrendingUp, BarChart3,
    Gauge, Timer, Users, HardDrive, Radio, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme-provider';
import { getChartColorsForTheme, getHttpStatusColor, type ChartColorPalette } from '@/lib/chart-colors';
import { SystemMetricCards, NginxMetricCards } from '@/components/analytics/metric-cards';
import { StatusDrillDown } from '@/components/analytics/StatusDrillDown';
import { formatTsTime } from '@/lib/format-timestamp';
import { AnimatePresence } from 'framer-motion';

// Skeleton components
function MetricCardSkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <div className="h-4 w-20 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                <div className="h-8 w-8 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardHeader>
            <CardContent>
                <div className="h-7 w-24 rounded animate-pulse mb-2" style={{ background: "rgb(var(--theme-border))" }} />
                <div className="h-3 w-32 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardContent>
        </Card>
    );
}

function ChartSkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <div className="h-5 w-40 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardHeader>
            <CardContent>
                <div className="h-[250px] rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardContent>
        </Card>
    );
}

// Metric Card Component
interface MetricCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ReactNode;
    trend?: { value: number; isUp: boolean };
    colorClass?: string;
    infoTooltip?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subValue, icon, trend, colorClass = "text-blue-400", infoTooltip }) => {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <div className="flex items-center gap-1.5">
                    <CardTitle className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>{title}</CardTitle>
                    {infoTooltip && (
                        <TooltipProvider>
                            <UITooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="bg-slate-900 border-slate-800 text-slate-200 max-w-[200px] text-xs font-normal">
                                    <p>{infoTooltip}</p>
                                </TooltipContent>
                            </UITooltip>
                        </TooltipProvider>
                    )}
                </div>
                <div className={`p-2 rounded-lg ${colorClass}`} style={{ background: "rgba(var(--theme-primary), 0.1)" }}>
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>{value}</div>
                {subValue && <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>{subValue}</p>}
                {trend && (
                    <div className={`flex items-center text-xs mt-1 ${trend.isUp ? "text-emerald-400" : "text-rose-400"}`}>
                        {trend.isUp ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {Math.abs(trend.value).toFixed(1)}% from last period
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Augment Templates
const AUGMENT_TEMPLATES = [
    { id: 'rate-limiting', name: 'HTTP Rate Limiting', desc: 'Limit requests per minute', params: [{ key: 'requests_per_minute', label: 'Rate (r/m)', default: 60 }, { key: 'burst_size', label: 'Burst', default: 10 }] },
    { id: 'health-checks', name: 'Active Health Checks', desc: 'Configure upstream health verification', params: [{ key: 'upstream_name', label: 'Upstream Name', default: 'backend' }, { key: 'interval', label: 'Interval (ms)', default: 3000 }] },
    { id: 'custom-404', name: 'Custom 404 Page', desc: 'Set a custom error path', params: [{ key: 'page_path', label: 'Page Path', default: '/404.html' }] },
    { id: 'gzip', name: 'Enable Gzip Compression', desc: 'Compress responses', params: [{ key: 'min_length', label: 'Min Length (bytes)', default: 256 }, { key: 'types', label: 'MIME Types', default: 'text/plain application/json' }] },
    { id: 'ssl-redirect', name: 'Force HTTPS Redirect', desc: 'Redirect HTTP to HTTPS', params: [] },
    { id: 'proxy-cache', name: 'Enable Proxy Caching', desc: 'Cache upstream responses', params: [{ key: 'cache_zone', label: 'Cache Zone', default: 'my_cache' }, { key: 'cache_valid', label: 'Cache Valid (s)', default: 3600 }] },
];

function MonitoringPageContent() {
    const { theme } = useTheme();
    const { selectedProject, selectedEnvironment } = useProject();

    // Theme-aware chart colors (WCAG compliant)
    const chartColors = getChartColorsForTheme(theme);
    const gridColor = chartColors.grid;
    const axisColor = chartColors.axis;
    const tooltipBg = chartColors.tooltipBg;
    const tooltipText = chartColors.tooltipText;
    const tooltipBorder = chartColors.tooltipBorder;

    // Connection status colors from theme
    const CONNECTION_COLORS = [
        chartColors.connectionActive,
        chartColors.connectionReading,
        chartColors.connectionWriting,
        chartColors.connectionWaiting
    ];

    // URL-based state for tab persistence
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const activeTab = searchParams.get('tab') || "overview";
    const setActiveTab = useCallback((value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "overview") {
            params.delete('tab');
        } else {
            params.set('tab', value);
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const [data, setData] = useState<any>(null);
    const [agents, setAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(5000);
    const [selectedAugment, setSelectedAugment] = useState<any>(null);
    const [augmentParams, setAugmentParams] = useState<any>({});
    const [augmentResult, setAugmentResult] = useState<string | null>(null);
    const [statusDrillClass, setStatusDrillClass] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    useEffect(() => {
        fetchAgents();
        fetchData();
        const interval = setInterval(fetchData, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval, selectedAgent, selectedProject, selectedEnvironment]);

    const fetchAgents = async () => {
        try {
            const res = await apiFetch('/api/servers');
            if (res.ok) {
                const json = await res.json();
                setAgents(json.agents || []);
            }
        } catch (error) {
            console.error("Failed to fetch agents", error);
        }
    };

    // When navigated from header search with ?q=, pre-select matching agent
    const qParam = searchParams.get('q')?.trim() || '';
    useEffect(() => {
        if (!qParam || agents.length === 0) return;
        const lower = qParam.toLowerCase();
        const match = agents.find(
            (a: any) =>
                (a.hostname && String(a.hostname).toLowerCase().includes(lower)) ||
                (a.agent_id && String(a.agent_id).toLowerCase().includes(lower)) ||
                (a.ip && String(a.ip).toLowerCase().includes(lower))
        );
        if (match?.agent_id) setSelectedAgent(match.agent_id);
    }, [agents, qParam]);

    const fetchData = async () => {
        try {
            const agentParam = selectedAgent !== 'all' ? `&agent_id=${selectedAgent}` : '';

            // Project/environment filtering
            let filterParam = '';
            if (selectedEnvironment) {
                filterParam = `&environment_id=${selectedEnvironment.id}`;
            } else if (selectedProject) {
                filterParam = `&project_id=${selectedProject.id}`;
            }

            const res = await apiFetch(`/api/analytics?window=1h${agentParam}${filterParam}`);
            const json = await res.json();
            setData(json);
        } catch (error) {
            console.error("Failed to fetch monitoring data", error);
            toast.error("Failed to fetch monitoring data");
        } finally {
            setLoading(false);
        }
    };

    const handleApplyAugment = async () => {
        if (!selectedAugment) return;

        try {
            let targetId = selectedAgent !== 'all' ? selectedAgent : null;
            if (!targetId && agents.length > 0) {
                targetId = agents[0].agent_id || agents[0].hostname;
            }
            if (!targetId) {
                toast.error("No target agent selected");
                return;
            }

            const res = await apiFetch('/api/provisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agent_id: targetId,
                    template: selectedAugment.id,
                    config: augmentParams
                })
            });
            const result = await res.json();

            if (result.success) {
                toast.success(`Configuration applied to ${targetId}`);
                setAugmentResult(`Successfully applied to ${targetId}`);
            } else {
                toast.error(`Failed: ${result.error || result.preview}`);
                setAugmentResult(`Error: ${result.preview || result.error}`);
            }
        } catch (e: any) {
            toast.error(`Request failed: ${e.message}`);
            setAugmentResult(`Request failed: ${e.message}`);
        }
    };

    // Process metrics
    const latestSys = data?.system_metrics?.[data.system_metrics.length - 1] || {};
    const latestNginx = data?.connections_history?.[data.connections_history.length - 1] || {};
    const summary = data?.summary || {};

    // Calculate derived metrics
    const requestsPerSec = useMemo(() => {
        if (!data?.connections_history || data.connections_history.length < 2) return 0;
        const history = data.connections_history;
        const latest = history[history.length - 1];
        const previous = history[history.length - 2];
        const timeDiff = (latest.timestamp - previous.timestamp) || 1;
        return ((latest.requests - previous.requests) / timeDiff).toFixed(1);
    }, [data?.connections_history]);

    const connectionDistribution = useMemo(() => {
        if (!latestNginx.active) return [];
        return [
            { name: 'Active', value: latestNginx.active || 0 },
            { name: 'Reading', value: latestNginx.reading || 0 },
            { name: 'Writing', value: latestNginx.writing || 0 },
            { name: 'Waiting', value: latestNginx.waiting || 0 },
        ].filter(d => d.value > 0);
    }, [latestNginx]);

    const httpStatusSummary = useMemo(() => {
        const status = data?.http_status_metrics || {};
        return {
            success: status.total_status_200_24h || 0,
            notFound: status.total_status_404_24h || 0,
            serverError: status.total_status_503 || 0,
        };
    }, [data?.http_status_metrics]);

    const formatBandwidth = useCallback((bytes: number) => {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }, []);

    const statusChartData = useMemo(() => (data?.status_distribution || []).map((s: any) => ({
        name: s.code,
        value: parseInt(s.count) || 0,
        color: getHttpStatusColor(s.code, theme as 'light' | 'dark')
    })).filter((d: any) => d.value > 0), [data?.status_distribution, theme]);

    const endpointData = useMemo(() => (data?.top_endpoints || []).map((e: any) => ({
        uri: e.uri,
        requests: parseInt(e.requests),
        errors: parseInt(e.errors),
        p95: e.p95,
        avgLatency: Math.round(e.p95 / 1.5),
        traffic: e.traffic
    })), [data?.top_endpoints]);

    const sortData = useCallback((arr: any[], key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return [...arr].sort((a, b) => (a[key] > b[key] ? -1 : 1));
        }
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            return [...arr].sort((a, b) => (a[key] > b[key] ? 1 : -1));
        }
        return arr;
    }, [sortConfig]);

    const sortedEndpoints = useMemo(() => sortData(endpointData, sortConfig?.key || 'requests'), [endpointData, sortConfig, sortData]);

    const requestDataForErrors = useMemo(() => (data?.request_rate || []).map((p: any) => ({
        time: p.time,
        requests: parseInt(p.requests) || 0,
        errors: parseInt(p.errors) || 0
    })), [data?.request_rate]);

    const handleSort = useCallback((key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);

    if (loading && !data) {
        return (
            <div className="p-6 space-y-6" style={{ background: "rgb(var(--theme-background))" }}>
                <div className="flex justify-between items-center">
                    <div>
                        <div className="h-8 w-48 rounded animate-pulse mb-2" style={{ background: "rgb(var(--theme-border))" }} />
                        <div className="h-4 w-64 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <MetricCardSkeleton key={i} />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChartSkeleton />
                    <ChartSkeleton />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 min-h-screen" style={{ background: "rgb(var(--theme-background))" }}>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
                        NGINX Monitoring
                    </h1>
                    <p style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Real-time telemetry and performance metrics
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                        <SelectTrigger className="w-[180px]" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <Server className="h-4 w-4 mr-2" style={{ color: "rgb(var(--theme-text-muted))" }} />
                            <SelectValue placeholder="Select Agent" />
                        </SelectTrigger>
                        <SelectContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <SelectItem value="all">All Agents</SelectItem>
                            {agents.map(agent => (
                                <SelectItem key={agent.agent_id} value={agent.agent_id}>
                                    {agent.hostname || agent.agent_id?.substring(0, 12)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <RefreshButton
                        loading={loading}
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            fetchData().finally(() => setRefreshing(false));
                        }}
                        disabled={loading}
                        aria-label="Refresh monitoring data"
                        size="default"
                    />
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Gauge className="h-4 w-4 mr-2" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="connections" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Network className="h-4 w-4 mr-2" />
                        Connections
                    </TabsTrigger>
                    <TabsTrigger value="traffic" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Traffic
                    </TabsTrigger>
                    <TabsTrigger value="errors" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Errors
                    </TabsTrigger>
                    <TabsTrigger value="host" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Cpu className="h-4 w-4 mr-2" />
                        Host
                    </TabsTrigger>
                    <TabsTrigger value="gateway" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Database className="h-4 w-4 mr-2" />
                        Gateway
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Gauge className="h-4 w-4 mr-2" />
                        Performance
                    </TabsTrigger>
                    <TabsTrigger value="config" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab (includes former Analytics overview content) */}
                <TabsContent value="overview" className="space-y-6">
                    {/* NGINX metric cards */}
                    <NginxMetricCards data={(data?.connections_history?.length || 0) > 0 ? {
                        active_connections: data.connections_history[data.connections_history.length - 1].active,
                        waiting: data.connections_history[data.connections_history.length - 1].waiting,
                        requests_per_second: data.connections_history[data.connections_history.length - 1].requests,
                        total_requests: summary.total_requests
                    } : null} />

                    {/* Primary KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <MetricCard
                            title="Requests/sec"
                            value={requestsPerSec}
                            icon={<Zap className="h-4 w-4" />}
                            colorClass="text-blue-400"
                            subValue={`${(summary.total_requests || 0).toLocaleString()} total`}
                        />
                        <MetricCard
                            title="Active Connections"
                            value={latestNginx.active || 0}
                            icon={<Users className="h-4 w-4" />}
                            colorClass="text-purple-400"
                            subValue={`${latestNginx.accepted || 0} accepted`}
                        />
                        <MetricCard
                            title="Error Rate"
                            value={`${(summary.error_rate || 0).toFixed(2)}%`}
                            icon={<AlertTriangle className="h-4 w-4" />}
                            colorClass={summary.error_rate > 1 ? "text-rose-400" : "text-emerald-400"}
                            subValue={summary.error_rate > 1 ? "Above threshold" : "Healthy"}
                            infoTooltip="This may include expected 4xx responses (auth failures, 404s, etc). Thresholds can be adjusted in Settings."
                        />
                        <MetricCard
                            title="Avg Latency"
                            value={`${Math.round(summary.avg_latency || 0)}ms`}
                            icon={<Timer className="h-4 w-4" />}
                            colorClass="text-amber-400"
                            subValue="p50 response time"
                        />
                        <MetricCard
                            title="Bandwidth"
                            value={formatBandwidth(summary.total_bandwidth || 0)}
                            icon={<Wifi className="h-4 w-4" />}
                            colorClass="text-cyan-400"
                            subValue="in window"
                        />
                    </div>

                    {/* Secondary metrics removed — see Connections tab for R/W/W and Traffic tab for status codes */}

                    {/* Request Rate & Connection Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Request Rate & Errors</CardTitle>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Traffic volume and error trends over time</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={data?.request_rate || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }}
                                            itemStyle={{ color: tooltipText }}
                                        />
                                        <Legend />
                                        <Area type="monotone" dataKey="requests" stroke={chartColors.info} fill={chartColors.info} fillOpacity={0.2} name="Requests" />
                                        <Area type="monotone" dataKey="errors" stroke={chartColors.error} fill={chartColors.error} fillOpacity={0.2} name="Errors" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Connection Distribution</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                {connectionDistribution.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <PieChart>
                                            <Pie
                                                data={connectionDistribution}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                dataKey="value"
                                                label={({ name, value }) => `${name}: ${value}`}
                                            >
                                                {connectionDistribution.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={CONNECTION_COLORS[index % CONNECTION_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        No connection data available
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* HTTP Status Distribution & Server Load Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>HTTP Status Distribution</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    {statusChartData.length > 0 ? (
                                        <><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                                                    cursor="pointer"
                                                    onClick={(_: any, index: number) => {
                                                        const entry = statusChartData[index];
                                                        if (entry) {
                                                            const code = String(entry.name);
                                                            // Map "200", "404" etc to class "2xx", "4xx"
                                                            const cls = code.length === 3 ? code[0] + "xx" : code;
                                                            setStatusDrillClass(cls);
                                                        }
                                                    }}
                                                >
                                                    {statusChartData.map((entry: any, index: number) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={entry.color}
                                                            style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <p className="text-center text-xs mt-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            Click a segment to drill down
                                        </p></>
                                    ) : (
                                        <div className="h-full flex items-center justify-center" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            No status distribution data
                                        </div>
                                    )}
                                </div>

                                {/* Drill-down panel — renders inside the card below the pie */}
                                <AnimatePresence>
                                    {statusDrillClass && (
                                        <StatusDrillDown
                                            window="1h"
                                            agentId={selectedAgent}
                                            statusChartData={statusChartData}
                                            initialClass={statusDrillClass}
                                            onClose={() => setStatusDrillClass(null)}
                                        />
                                    )}
                                </AnimatePresence>
                            </CardContent>
                        </Card>

                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Server Load Distribution</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {(data?.server_distribution?.length || 0) > 0 ? (
                                        (data.server_distribution as any[]).slice(0, 5).map((s: any, idx: number) => (
                                            <div key={idx} className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="font-medium truncate max-w-[200px]" style={{ color: "rgb(var(--theme-text))" }}>
                                                        {s.hostname}
                                                    </span>
                                                    <span style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                        {s.requests?.toLocaleString?.() ?? s.requests} reqs
                                                    </span>
                                                </div>
                                                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgb(var(--theme-surface-light))" }}>
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{ width: `${Math.min(((s.requests || 0) / (summary.total_requests || 1)) * 100, 100)}%`, background: "rgb(var(--theme-primary))" }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    <span>{typeof s.traffic === 'number' ? formatBandwidth(s.traffic) : s.traffic}</span>
                                                    <span className={(s.error_rate || 0) > 5 ? "text-red-400" : ""}>
                                                        {(s.error_rate ?? 0).toFixed(1)}% errors
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            No server distribution data available
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Connections Tab */}
                <TabsContent value="connections" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="Total Accepted" value={(latestNginx.accepted || 0).toLocaleString()} icon={<Network className="h-4 w-4" />} colorClass="text-blue-400" />
                        <MetricCard title="Total Handled" value={(latestNginx.handled || 0).toLocaleString()} icon={<CheckCircle className="h-4 w-4" />} colorClass="text-green-400" />
                        <MetricCard title="Dropped" value={Math.max(0, (latestNginx.accepted || 0) - (latestNginx.handled || 0)).toLocaleString()} icon={<AlertTriangle className="h-4 w-4" />} colorClass="text-rose-400" />
                        <MetricCard title="Keep-Alive" value={latestNginx.waiting || 0} icon={<Radio className="h-4 w-4" />} colorClass="text-purple-400" />
                    </div>

                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Connection States Over Time</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={data?.connections_history || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                    <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                    <YAxis stroke={axisColor} fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }}
                                        itemStyle={{ color: tooltipText }}
                                    />
                                    <Line type="monotone" dataKey="active" stroke={chartColors.connectionActive} strokeWidth={2} name="Active" dot={false} />
                                    <Line type="monotone" dataKey="reading" stroke={chartColors.connectionReading} strokeWidth={2} name="Reading" dot={false} />
                                    <Line type="monotone" dataKey="writing" stroke={chartColors.connectionWriting} strokeWidth={2} name="Writing" dot={false} />
                                    <Line type="monotone" dataKey="waiting" stroke={chartColors.connectionWaiting} strokeWidth={2} name="Waiting" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Traffic Tab */}
                <TabsContent value="traffic" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>HTTP 2xx Success Rate</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={data?.http_status_metrics?.status_2xx_5min || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }} />
                                        <Area type="monotone" dataKey="requests" stroke={chartColors.status2xx} fill={chartColors.status2xx} fillOpacity={0.2} name="2xx" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>HTTP 4xx/5xx Errors</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <LineChart data={data?.http_status_metrics?.status_4xx_5min || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }} />
                                        <Line type="monotone" dataKey="requests" stroke={chartColors.status4xx} strokeWidth={2} name="4xx" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Top URLs by Traffic (merged from Analytics) */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Top URLs by Traffic</CardTitle>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Most requested endpoints sorted by volume</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('uri')}>URL Path</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('requests')}>Requests</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('traffic')}>Bandwidth</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('avgLatency')}>Avg Latency</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('errors')}>Errors</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedEndpoints.map((stat: any, idx: number) => (
                                        <TableRow key={idx} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableCell className="font-mono text-sm max-w-[300px] truncate" style={{ color: "rgb(var(--theme-text))" }}>{stat.uri}</TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{stat.requests.toLocaleString()}</TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{typeof stat.traffic === 'number' ? formatBandwidth(stat.traffic) : (stat.traffic ?? '—')}</TableCell>
                                            <TableCell>
                                                <Badge className={stat.avgLatency > 150 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"}>
                                                    {stat.avgLatency}ms
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {stat.errors > 0 ? (
                                                    <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{stat.errors}</Badge>
                                                ) : (
                                                    <span style={{ color: "rgb(var(--theme-text-muted))" }}>0</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {sortedEndpoints.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                No traffic data available for the selected period
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Errors Tab (from Analytics) */}
                <TabsContent value="errors" className="space-y-6">
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Error Rate Over Time</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={requestDataForErrors}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }}
                                        />
                                        <Area type="monotone" dataKey="errors" stroke={chartColors.error} fill={chartColors.error} fillOpacity={0.2} strokeWidth={2} name="Errors" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Error-Prone Endpoints</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Endpoint</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Total Errors</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Error Rate</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Requests</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedEndpoints.filter((e: any) => e.errors > 0).slice(0, 5).map((endpoint: any, idx: number) => (
                                        <TableRow key={idx} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableCell className="font-mono text-sm" style={{ color: "rgb(var(--theme-text))" }}>{endpoint.uri}</TableCell>
                                            <TableCell>
                                                <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{endpoint.errors}</Badge>
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {((endpoint.errors / endpoint.requests) * 100).toFixed(2)}%
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{endpoint.requests.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                    {sortedEndpoints.filter((e: any) => e.errors > 0).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                No errors recorded in the selected time range
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Host Tab (node/host metrics) */}
                <TabsContent value="host" className="space-y-6">
                    {/* Data Source Indicator */}
                    <Card style={{ background: "rgba(var(--theme-primary), 0.05)", borderColor: "rgb(var(--theme-border))" }}>
                        <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/10">
                                        <Server className="h-4 w-4 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                            {selectedAgent === 'all'
                                                ? `Aggregated Metrics (${agents.length} NGINX Nodes)`
                                                : `Host Metrics: ${agents.find(a => a.agent_id === selectedAgent)?.hostname || selectedAgent}`
                                            }
                                        </p>
                                        <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            {selectedAgent === 'all'
                                                ? 'Showing average CPU/Memory across all connected NGINX agent hosts'
                                                : 'Showing system metrics from the selected agent\'s host machine'
                                            }
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                    {selectedAgent === 'all' ? 'Fleet Average' : 'Single Node'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard
                            title={selectedAgent === 'all' ? "Avg CPU Usage" : "CPU Usage"}
                            value={`${(latestSys.cpu_usage || latestSys.cpuUsage || 0).toFixed(1)}%`}
                            icon={<Cpu className="h-4 w-4" />}
                            colorClass="text-blue-400"
                            subValue={`User: ${(latestSys.cpu_user || 0).toFixed(1)}%`}
                        />
                        <MetricCard
                            title={selectedAgent === 'all' ? "Avg Memory Usage" : "Memory Usage"}
                            value={`${(latestSys.memory_usage || latestSys.memoryUsage || 0).toFixed(1)}%`}
                            icon={<HardDrive className="h-4 w-4" />}
                            colorClass="text-amber-400"
                        />
                        <MetricCard
                            title="Network In"
                            value={`${((latestSys.network_rx_rate || latestSys.networkRxRate || 0) / 1024).toFixed(1)} KB/s`}
                            icon={<ArrowDownRight className="h-4 w-4" />}
                            colorClass="text-green-400"
                        />
                        <MetricCard
                            title="Network Out"
                            value={`${((latestSys.network_tx_rate || latestSys.networkTxRate || 0) / 1024).toFixed(1)} KB/s`}
                            icon={<ArrowUpRight className="h-4 w-4" />}
                            colorClass="text-purple-400"
                        />
                    </div>

                    {/* Per-Agent Breakdown Table (only when 'all' is selected) */}
                    {selectedAgent === 'all' && agents.length > 0 && (
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Per-Node Resource Usage</CardTitle>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Click on a node to view detailed metrics
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Node</TableHead>
                                            <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Status</TableHead>
                                            <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Type</TableHead>
                                            <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {agents.map((agent) => (
                                            <TableRow
                                                key={agent.agent_id}
                                                style={{ borderColor: "rgb(var(--theme-border))" }}
                                                className="cursor-pointer hover:bg-blue-500/5"
                                                onClick={() => setSelectedAgent(agent.agent_id)}
                                            >
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg bg-blue-500/10">
                                                            <Cpu className="h-4 w-4 text-blue-400" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                                                {agent.hostname || 'Unknown'}
                                                            </p>
                                                            <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                                {agent.ip || agent.pod_ip || 'N/A'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={agent.last_seen && (Date.now() / 1000 - parseInt(agent.last_seen)) < 180
                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                            : "bg-red-500/10 text-red-400 border-red-500/20"
                                                        }
                                                    >
                                                        {agent.last_seen && (Date.now() / 1000 - parseInt(agent.last_seen)) < 180 ? 'Online' : 'Offline'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    {agent.is_pod ? 'Kubernetes Pod' : 'VM / Bare Metal'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge
                                                        variant="outline"
                                                        className="cursor-pointer hover:bg-blue-500/20"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAgent(agent.agent_id);
                                                        }}
                                                    >
                                                        View Metrics
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle style={{ color: "rgb(var(--theme-text))" }}>
                                        {selectedAgent === 'all' ? 'Average CPU Usage' : 'CPU Usage'} Over Time
                                    </CardTitle>
                                    <Badge variant="outline" className="text-xs">
                                        {selectedAgent === 'all' ? 'Fleet Avg' : 'Single Host'}
                                    </Badge>
                                </div>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    {selectedAgent === 'all'
                                        ? 'Mean CPU utilization across all NGINX host machines'
                                        : 'CPU utilization on the selected host machine'
                                    }
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={data?.system_metrics || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} unit="%" domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }}
                                        />
                                        <Area type="monotone" dataKey="cpu_usage" stroke={chartColors.cpu} fill={chartColors.cpu} fillOpacity={0.2} name="CPU" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle style={{ color: "rgb(var(--theme-text))" }}>
                                        {selectedAgent === 'all' ? 'Average Memory Usage' : 'Memory Usage'} Over Time
                                    </CardTitle>
                                    <Badge variant="outline" className="text-xs">
                                        {selectedAgent === 'all' ? 'Fleet Avg' : 'Single Host'}
                                    </Badge>
                                </div>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    {selectedAgent === 'all'
                                        ? 'Mean memory utilization across all NGINX host machines'
                                        : 'Memory utilization on the selected host machine'
                                    }
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={data?.system_metrics || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} unit="%" domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: tooltipBg, borderColor: gridColor, borderRadius: "0.375rem", color: tooltipText }}
                                        />
                                        <Area type="monotone" dataKey="memory_usage" stroke={chartColors.memory} fill={chartColors.memory} fillOpacity={0.2} name="Memory" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Gateway Tab (from Analytics) */}
                <TabsContent value="gateway" className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <MetricCard
                            title="Gateway EPS"
                            value={(() => {
                                const metrics = data?.gateway_metrics || [];
                                const maxEps = metrics.reduce((max: number, curr: any) => Math.max(max, Number(curr.eps || 0)), 0);
                                return maxEps > 0 ? maxEps.toFixed(1) : "0";
                            })()}
                            subValue="Peak events/second"
                            icon={<Zap className="h-4 w-4" />}
                            colorClass="text-blue-400"
                        />
                        <MetricCard
                            title="Active Streams"
                            value={(data?.gateway_metrics?.length || 0) > 0 ? data.gateway_metrics[data.gateway_metrics.length - 1].active_connections || 0 : 0}
                            subValue="Agent gRPC connections"
                            icon={<Wifi className="h-4 w-4" />}
                            colorClass="text-green-400"
                        />
                        <MetricCard
                            title="DB Latency"
                            value={`${(data?.gateway_metrics?.length || 0) > 0 ? Number(data.gateway_metrics[data.gateway_metrics.length - 1].db_latency || 0).toFixed(2) : 0}ms`}
                            subValue="ClickHouse insert avg"
                            icon={<Database className="h-4 w-4" />}
                            colorClass="text-amber-400"
                        />
                        <MetricCard
                            title="Memory"
                            value={`${(data?.gateway_metrics?.length || 0) > 0 ? Number(data.gateway_metrics[data.gateway_metrics.length - 1].memory_mb || 0).toFixed(0) : 0}MB`}
                            subValue="Gateway heap usage"
                            icon={<HardDrive className="h-4 w-4" />}
                            colorClass="text-purple-400"
                        />
                    </div>
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Message Rate (EPS)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={data?.gateway_metrics || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                        <Area type="monotone" dataKey="eps" stroke={chartColors.info} fill={chartColors.info} fillOpacity={0.2} strokeWidth={2} name="EPS" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Resource Usage</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <LineChart data={data?.gateway_metrics || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                            <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                            <YAxis stroke={axisColor} fontSize={12} />
                                            <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                            <Legend />
                                            <Line type="monotone" dataKey="cpu_usage" stroke={chartColors.cpu} strokeWidth={2} name="CPU %" dot={false} />
                                            <Line type="monotone" dataKey="memory_mb" stroke={chartColors.memory} strokeWidth={2} name="Memory MB" dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>DB Latency Trend</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <LineChart data={data?.gateway_metrics || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                            <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                            <YAxis stroke={axisColor} fontSize={12} unit="ms" />
                                            <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                            <Line type="monotone" dataKey="db_latency" stroke={chartColors.success} strokeWidth={2} name="Latency (ms)" dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Performance Tab (from Analytics) */}
                <TabsContent value="performance" className="space-y-6">
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Latency Percentiles</CardTitle>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>P50, P95, and P99 response times over the selected period</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <LineChart data={data?.latency_trend || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} unit="ms" />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                        <Legend />
                                        <Line type="monotone" dataKey="p50" stroke={chartColors.latencyP50} strokeWidth={2} name="P50" dot={false} />
                                        <Line type="monotone" dataKey="p95" stroke={chartColors.latencyP95} strokeWidth={2} name="P95" dot={false} />
                                        <Line type="monotone" dataKey="p99" stroke={chartColors.latencyP99} strokeWidth={2} name="P99" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Latency Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <BarChart data={data?.latency_distribution || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="bucket" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                            {(data?.latency_distribution || []).map((entry: any, index: number) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={
                                                        entry.bucket?.includes('500ms') || entry.bucket?.includes('1s') ? chartColors.latencyP99 :
                                                        entry.bucket?.includes('200ms') || entry.bucket?.includes('300ms') ? chartColors.latencyP95 :
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
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Slowest Endpoints</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('uri')}>Endpoint</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('avgLatency')}>Avg Latency</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('p95')}>P95</TableHead>
                                        <TableHead className="cursor-pointer hover:opacity-90 rounded py-2" style={{ color: "rgb(var(--theme-text-muted))" }} onClick={() => handleSort('requests')}>Requests</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedEndpoints.slice(0, 5).map((endpoint: any, idx: number) => (
                                        <TableRow key={idx} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableCell className="font-mono text-sm" style={{ color: "rgb(var(--theme-text))" }}>{endpoint.uri}</TableCell>
                                            <TableCell>
                                                <Badge className={endpoint.avgLatency > 150 ? "bg-red-500/15 text-red-400" : endpoint.avgLatency > 100 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}>
                                                    {endpoint.avgLatency}ms
                                                </Badge>
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{endpoint.p95}ms</TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{endpoint.requests.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* System Tab removed — duplicate of Host tab. See Host tab for system metrics. */}
                {/*
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>CPU Usage</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <AreaChart data={data?.system_metrics || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                            <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                            <YAxis stroke={axisColor} fontSize={12} unit="%" domain={[0, 100]} />
                                            <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                            <Area type="monotone" dataKey="cpu_usage" stroke="#818cf8" fill="#818cf8" fillOpacity={0.3} strokeWidth={2} name="CPU %" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader className="pb-2">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Memory Usage</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <AreaChart data={data?.system_metrics || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                            <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                            <YAxis stroke={axisColor} fontSize={12} unit="%" domain={[0, 100]} />
                                            <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                            <Area type="monotone" dataKey="memory_usage" stroke={chartColors.memory} fill={chartColors.memory} fillOpacity={0.3} strokeWidth={2} name="Memory %" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Network Throughput</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <LineChart data={data?.system_metrics || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "0.5rem", color: tooltipText }} />
                                        <Legend />
                                        <Line type="monotone" dataKey="network_rx_rate" stroke={chartColors.networkRx} strokeWidth={2} name="RX Rate" dot={false} />
                                        <Line type="monotone" dataKey="network_tx_rate" stroke={chartColors.networkTx} strokeWidth={2} name="TX Rate" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                */}

                {/* Configure Tab */}
                <TabsContent value="config" className="space-y-6">
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Configuration Provisions</CardTitle>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Apply pre-built NGINX configurations to your agents
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {AUGMENT_TEMPLATES.map(template => (
                                    <Dialog key={template.id}>
                                        <DialogTrigger asChild>
                                            <Card
                                                className="cursor-pointer hover:border-blue-500/50 transition-colors"
                                                style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}
                                                onClick={() => {
                                                    setSelectedAugment(template);
                                                    setAugmentParams({});
                                                    setAugmentResult(null);
                                                }}
                                            >
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm" style={{ color: "rgb(var(--theme-text))" }}>
                                                        {template.name}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                        {template.desc}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        </DialogTrigger>
                                        <DialogContent style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}>
                                            <DialogHeader>
                                                <DialogTitle style={{ color: "rgb(var(--theme-text))" }}>Configure: {template.name}</DialogTitle>
                                                <DialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>{template.desc}</DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 py-4">
                                                {template.params.length === 0 ? (
                                                    <p style={{ color: "rgb(var(--theme-text-muted))" }}>No parameters required</p>
                                                ) : (
                                                    template.params.map((param: any) => (
                                                        <div key={param.key} className="space-y-2">
                                                            <Label style={{ color: "rgb(var(--theme-text))" }}>{param.label}</Label>
                                                            {param.type === 'textarea' ? (
                                                                <Textarea
                                                                    defaultValue={param.default}
                                                                    onChange={(e) => setAugmentParams({ ...augmentParams, [param.key]: e.target.value })}
                                                                    style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}
                                                                />
                                                            ) : (
                                                                <Input
                                                                    type={param.type || 'text'}
                                                                    defaultValue={param.default}
                                                                    onChange={(e) => setAugmentParams({ ...augmentParams, [param.key]: e.target.value })}
                                                                    style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}
                                                                />
                                                            )}
                                                        </div>
                                                    ))
                                                )}

                                                {selectedAgent === 'all' && agents.length > 0 && (
                                                    <div className="space-y-2">
                                                        <Label style={{ color: "rgb(var(--theme-text))" }}>Target Agent</Label>
                                                        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                                                            <SelectTrigger style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                                                                <SelectValue placeholder="Select target agent" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {agents.map(agent => (
                                                                    <SelectItem key={agent.agent_id} value={agent.agent_id}>
                                                                        {agent.hostname || agent.agent_id}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </div>
                                            <DialogFooter className="flex-col !items-start gap-2">
                                                <Button onClick={handleApplyAugment} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                                    Apply Configuration
                                                </Button>
                                                {augmentResult && (
                                                    <div className={`text-sm p-2 rounded w-full ${augmentResult.includes('Success') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {augmentResult}
                                                    </div>
                                                )}
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Logs */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Recent Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Time</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Method</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Path</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Status</TableHead>
                                        <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Latency</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.recent_requests || []).slice(0, 10).map((log: any, i: number) => (
                                        <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {formatTsTime(log.timestamp)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={log.request_method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
                                                    {log.request_method}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs" style={{ color: "rgb(var(--theme-text))" }}>
                                                {log.request_uri}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={
                                                    log.status >= 500 ? 'bg-rose-500/20 text-rose-400' :
                                                        log.status >= 400 ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-emerald-500/20 text-emerald-400'
                                                }>
                                                    {log.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {(log.request_time * 1000).toFixed(1)}ms
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!data?.recent_requests || data.recent_requests.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                No recent requests
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// Suspense fallback skeleton
function MonitoringPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="h-8 w-48 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                ))}
            </div>
            <div className="h-96 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
        </div>
    );
}

export default function MonitoringPage() {
    return (
        <Suspense fallback={<MonitoringPageSkeleton />}>
            <MonitoringPageContent />
        </Suspense>
    );
}
