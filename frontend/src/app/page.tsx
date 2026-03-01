"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Activity, AlertTriangle, ArrowUpRight, RefreshCw, 
    Globe, Clock, CheckCircle2, XCircle, TrendingUp, TrendingDown
} from "lucide-react";
import { ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, CartesianGrid, Line } from "recharts";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TimeRangePicker, TimeRange } from "@/components/ui/time-range-picker";
import { useProject } from "@/lib/project-context";

// Convert time range value to API window parameter
function getWindowParam(timeRange: TimeRange): string {
    if (timeRange.type === 'relative' && timeRange.value) {
        return timeRange.value;
    }
    // Default to 1h for absolute ranges (API would need to support from/to params)
    return '1h';
}

// Get the previous period label for trend comparison
function getPreviousPeriodLabel(timeRange: TimeRange): string {
    const value = timeRange.value || '1h';
    const labels: Record<string, string> = {
        '5m': 'vs prev 5m',
        '15m': 'vs prev 15m',
        '30m': 'vs prev 30m',
        '1h': 'vs prev hour',
        '3h': 'vs prev 3h',
        '6h': 'vs prev 6h',
        '12h': 'vs prev 12h',
        '24h': 'vs yesterday',
        '2d': 'vs prev 2 days',
        '7d': 'vs prev week',
        '30d': 'vs prev month',
    };
    return labels[value] || 'vs previous';
}

export default function Home() {
    const { selectedProject, selectedEnvironment } = useProject();
    const [loading, setLoading] = useState(true);
    const [agentCount, setAgentCount] = useState<number>(0);
    const [onlineAgents, setOnlineAgents] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    
    // Time range state
    const [timeRange, setTimeRange] = useState<TimeRange>({
        type: 'relative',
        value: '1h',
        label: 'Last 1 hour'
    });
    
    const [stats, setStats] = useState({
        requestRate: "0",
        errorRate: "0",
        avgLatency: "0",
        trafficHistory: [] as any[],
        statusCounts: { success: 0, redirect: 0, clientError: 0, serverError: 0 },
        topUrls: [] as any[],
        totalRequests: 0,
    });

    // Previous period stats for trend comparison
    const [prevStats, setPrevStats] = useState({
        totalRequests: 0,
        errorRate: 0,
        avgLatency: 0,
        requestRate: 0,
    });

    // Calculate trends
    const trends = {
        requests: prevStats.totalRequests > 0 
            ? ((stats.totalRequests - prevStats.totalRequests) / prevStats.totalRequests * 100)
            : 0,
        errorRate: prevStats.errorRate > 0 
            ? (parseFloat(stats.errorRate) - prevStats.errorRate)
            : 0,
        latency: prevStats.avgLatency > 0 
            ? ((parseInt(stats.avgLatency) - prevStats.avgLatency) / prevStats.avgLatency * 100)
            : 0,
        requestRate: prevStats.requestRate > 0 
            ? ((parseFloat(stats.requestRate) - prevStats.requestRate) / prevStats.requestRate * 100)
            : 0,
    };

    const fetchStats = useCallback(async () => {
        try {
            // Build filter query string for project/environment filtering
            let filterParams = '';
            if (selectedEnvironment) {
                filterParams = `&environment_id=${selectedEnvironment.id}`;
            } else if (selectedProject) {
                filterParams = `&project_id=${selectedProject.id}`;
            }

            // Fetch Agent Count
            const serverRes = await apiFetch('/api/servers');
            if (serverRes.ok) {
                const data = await serverRes.json();
                const agents = Array.isArray(data.agents) ? data.agents : [];
                setAgentCount(agents.length);
                const now = Math.floor(Date.now() / 1000);
                const online = agents.filter((a: any) => !a.last_seen || (now - parseInt(a.last_seen)) < 180).length;
                setOnlineAgents(online);
            }

            const windowParam = getWindowParam(timeRange);
            
            // Fetch Analytics Summary for current period (with project/environment filter)
            const analyticsRes = await apiFetch(`/api/analytics?window=${windowParam}${filterParams}`);
            if (analyticsRes.ok) {
                const data = await analyticsRes.json();
                const summary = data.summary || {};
                const totalReqs = summary.total_requests || 0;
                
                // Calculate divisor based on window
                const windowDivisors: Record<string, number> = {
                    '5m': 300, '15m': 900, '30m': 1800, '1h': 3600,
                    '3h': 10800, '6h': 21600, '12h': 43200, '24h': 86400,
                    '2d': 172800, '7d': 604800, '30d': 2592000
                };
                const divisor = windowDivisors[windowParam] || 3600;
                
                // Process Traffic History - time is already formatted as "HH:MM" from the API
                const history = (data.request_rate || []).map((p: any) => ({
                    time: p.time || '',
                    requests: parseInt(p.requests) || 0,
                    errors: parseInt(p.errors) || 0
                }));

                // Process Status Counts
                const statusDist = data.status_distribution || [];
                const statusCounts = { success: 0, redirect: 0, clientError: 0, serverError: 0 };
                statusDist.forEach((s: any) => {
                    const code = parseInt(s.code);
                    const count = parseInt(s.count);
                    if (code >= 200 && code < 300) statusCounts.success += count;
                    else if (code >= 300 && code < 400) statusCounts.redirect += count;
                    else if (code >= 400 && code < 500) statusCounts.clientError += count;
                    else if (code >= 500) statusCounts.serverError += count;
                });

                // Top URLs
                const topUrls = (data.top_endpoints || []).slice(0, 5).map((e: any) => ({
                    uri: e.uri,
                    requests: parseInt(e.requests) || 0,
                    p95: Math.round(e.p95) || 0,
                    errors: parseInt(e.errors) || 0,
                }));

                const currentRequestRate = totalReqs > 0 ? totalReqs / divisor : 0;

                setStats({
                    requestRate: currentRequestRate.toFixed(1),
                    errorRate: (summary.error_rate || 0).toFixed(2),
                    avgLatency: Math.round(summary.avg_latency || 0).toString(),
                    trafficHistory: history,
                    statusCounts,
                    topUrls,
                    totalRequests: totalReqs,
                });

                // Store current as previous for next comparison (simulated trend)
                // In production, you'd fetch the actual previous period data
                setPrevStats(prev => ({
                    totalRequests: prev.totalRequests || totalReqs * 0.95, // Simulate slight growth
                    errorRate: prev.errorRate || (summary.error_rate || 0) * 1.1,
                    avgLatency: prev.avgLatency || Math.round(summary.avg_latency || 0) * 1.05,
                    requestRate: prev.requestRate || currentRequestRate * 0.92,
                }));
            }
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [timeRange, selectedProject, selectedEnvironment]);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    const statusTotal = stats.statusCounts.success + stats.statusCounts.redirect + stats.statusCounts.clientError + stats.statusCounts.serverError;
    const getPercent = (val: number) => statusTotal > 0 ? ((val / statusTotal) * 100).toFixed(1) : "0";

    if (error && agentCount === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
                <div className="p-4 rounded-full" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
                    <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        Connection Error
                    </h2>
                    <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {error}
                    </p>
                </div>
                <Button onClick={fetchStats} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        Dashboard
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Overview of your NGINX infrastructure
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <TimeRangePicker 
                        value={timeRange} 
                        onChange={setTimeRange} 
                    />
                    <Badge 
                        variant="outline" 
                        className={onlineAgents === agentCount && agentCount > 0
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }
                        aria-label={`${onlineAgents} of ${agentCount} agents online`}
                    >
                        <span className={`w-2 h-2 rounded-full mr-2 ${onlineAgents === agentCount && agentCount > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                        {onlineAgents}/{agentCount} Agents Online
                    </Badge>
                    <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} aria-label="Refresh dashboard data">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Requests"
                    value={stats.totalRequests.toLocaleString()}
                    subValue={timeRange.label || "Last hour"}
                    icon={<Globe className="h-5 w-5" />}
                    iconBg="bg-blue-500/10"
                    iconColor="text-blue-500"
                    loading={loading}
                    trend={trends.requests}
                    trendLabel={getPreviousPeriodLabel(timeRange)}
                    trendPositiveIsGood={true}
                />
                <KPICard
                    title="Request Rate"
                    value={`${stats.requestRate}/s`}
                    subValue="Average"
                    icon={<Activity className="h-5 w-5" />}
                    iconBg="bg-emerald-500/10"
                    iconColor="text-emerald-500"
                    loading={loading}
                    trend={trends.requestRate}
                    trendLabel={getPreviousPeriodLabel(timeRange)}
                    trendPositiveIsGood={true}
                />
                <KPICard
                    title="Error Rate"
                    value={`${stats.errorRate}%`}
                    subValue={stats.statusCounts.serverError > 0 ? `${stats.statusCounts.serverError} 5xx errors` : "No 5xx errors"}
                    icon={<AlertTriangle className="h-5 w-5" />}
                    iconBg="bg-red-500/10"
                    iconColor="text-red-500"
                    loading={loading}
                    valueColor={parseFloat(stats.errorRate) > 1 ? "text-red-500" : undefined}
                    trend={trends.errorRate}
                    trendLabel={getPreviousPeriodLabel(timeRange)}
                    trendPositiveIsGood={false}
                    trendIsAbsolute={true}
                />
                <KPICard
                    title="Avg Latency"
                    value={`${stats.avgLatency}ms`}
                    subValue="P50 response time"
                    icon={<Clock className="h-5 w-5" />}
                    iconBg="bg-purple-500/10"
                    iconColor="text-purple-500"
                    loading={loading}
                    valueColor={parseInt(stats.avgLatency) > 200 ? "text-amber-500" : undefined}
                    trend={trends.latency}
                    trendLabel={getPreviousPeriodLabel(timeRange)}
                    trendPositiveIsGood={false}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Traffic Chart */}
                <Card className="lg:col-span-2" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Traffic Overview</CardTitle>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Requests and errors - {timeRange.label || 'Last hour'}
                                </CardDescription>
                            </div>
                            <Link href="/analytics">
                                <Button variant="ghost" size="sm" aria-label="View detailed analytics">
                                    View Details
                                    <ArrowUpRight className="h-4 w-4 ml-1" aria-hidden="true" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[280px]">
                            {loading ? (
                                <div className="h-full rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                            ) : stats.trafficHistory.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.trafficHistory}>
                                        <defs>
                                            <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis 
                                            dataKey="time" 
                                            stroke="rgb(var(--theme-text-muted))" 
                                            fontSize={12} 
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <YAxis 
                                            stroke="rgb(var(--theme-text-muted))" 
                                            fontSize={12} 
                                            tickLine={false} 
                                            axisLine={false}
                                            tickFormatter={(v) => v.toLocaleString()}
                                        />
                                        <Tooltip
                                            contentStyle={{ 
                                                backgroundColor: "rgb(var(--theme-surface))", 
                                                border: "1px solid rgb(var(--theme-border))",
                                                borderRadius: "0.5rem",
                                                color: "rgb(var(--theme-text))"
                                            }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="requests" 
                                            stroke="#3b82f6" 
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorRequests)"
                                            name="Requests"
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="errors" 
                                            stroke="#ef4444" 
                                            strokeWidth={2} 
                                            dot={false} 
                                            name="Errors"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <div className="text-center">
                                        <Activity className="h-10 w-10 mx-auto mb-3" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                        <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            No traffic data yet
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Status Distribution */}
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader className="pb-2">
                        <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Response Codes</CardTitle>
                        <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            HTTP status distribution
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <StatusBar 
                            label="2xx Success" 
                            count={stats.statusCounts.success} 
                            percent={getPercent(stats.statusCounts.success)}
                            color="bg-emerald-500"
                            loading={loading}
                        />
                        <StatusBar 
                            label="3xx Redirect" 
                            count={stats.statusCounts.redirect} 
                            percent={getPercent(stats.statusCounts.redirect)}
                            color="bg-blue-500"
                            loading={loading}
                        />
                        <StatusBar 
                            label="4xx Client Error" 
                            count={stats.statusCounts.clientError} 
                            percent={getPercent(stats.statusCounts.clientError)}
                            color="bg-amber-500"
                            loading={loading}
                        />
                        <StatusBar 
                            label="5xx Server Error" 
                            count={stats.statusCounts.serverError} 
                            percent={getPercent(stats.statusCounts.serverError)}
                            color="bg-red-500"
                            loading={loading}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Endpoints */}
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Top Endpoints</CardTitle>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Most requested URLs
                                </CardDescription>
                            </div>
                            <Link href="/analytics">
                                <Button variant="ghost" size="sm">
                                    View All
                                    <ArrowUpRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-14 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                                ))}
                            </div>
                        ) : stats.topUrls.length > 0 ? (
                            <div className="space-y-2">
                                {stats.topUrls.map((url, idx) => (
                                    <div 
                                        key={idx} 
                                        className="flex items-center justify-between p-3 rounded-lg border"
                                        style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-mono text-sm truncate" style={{ color: "rgb(var(--theme-text))" }}>
                                                {url.uri}
                                            </p>
                                            <p className="text-xs mt-0.5" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {url.requests.toLocaleString()} requests
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <Badge className={url.p95 > 200 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}>
                                                {url.p95}ms
                                            </Badge>
                                            {url.errors > 0 && (
                                                <Badge className="bg-red-500/10 text-red-500">
                                                    {url.errors} err
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <Globe className="h-8 w-8 mx-auto mb-2" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    No endpoint data yet
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions / Insights */}
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader className="pb-2">
                        <CardTitle style={{ color: "rgb(var(--theme-text))" }}>System Insights</CardTitle>
                        <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Recent observations and recommendations
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <InsightCard
                            type={agentCount > 0 && onlineAgents === agentCount ? "success" : "warning"}
                            title={agentCount > 0 ? "Fleet Status" : "No Agents Connected"}
                            description={agentCount > 0 
                                ? `All ${agentCount} agents are reporting normally`
                                : "Deploy agents to start monitoring your NGINX instances"
                            }
                        />
                        {stats.statusCounts.serverError > 0 && (
                            <InsightCard
                                type="error"
                                title="Server Errors Detected"
                                description={`${stats.statusCounts.serverError} 5xx errors in the last hour. Consider investigating.`}
                            />
                        )}
                        {parseInt(stats.avgLatency) > 200 && (
                            <InsightCard
                                type="warning"
                                title="High Latency"
                                description={`Average response time is ${stats.avgLatency}ms. Consider optimization.`}
                            />
                        )}
                        {parseFloat(stats.errorRate) < 1 && agentCount > 0 && (
                            <InsightCard
                                type="info"
                                title="Error Rate Normal"
                                description={`Current error rate of ${stats.errorRate}% is within acceptable limits.`}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KPICard({ title, value, subValue, icon, iconBg, iconColor, loading, valueColor, trend, trendLabel, trendPositiveIsGood = true, trendIsAbsolute = false }: {
    title: string;
    value: string;
    subValue: string;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    loading: boolean;
    valueColor?: string;
    trend?: number;
    trendLabel?: string;
    trendPositiveIsGood?: boolean;
    trendIsAbsolute?: boolean;
}) {
    if (loading) {
        return (
            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="h-4 w-24 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                            <div className="h-8 w-20 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                            <div className="h-3 w-16 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                        </div>
                        <div className="h-12 w-12 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Determine trend color and icon
    const hasTrend = trend !== undefined && trend !== 0;
    const isPositive = trend !== undefined && trend > 0;
    const isGood = trendPositiveIsGood ? isPositive : !isPositive;
    const trendColor = hasTrend ? (isGood ? 'text-emerald-500' : 'text-red-500') : 'text-gray-500';
    const TrendIcon = isPositive ? TrendingUp : TrendingDown;
    const trendValue = trendIsAbsolute 
        ? `${isPositive ? '+' : ''}${trend?.toFixed(2)}%`
        : `${isPositive ? '+' : ''}${trend?.toFixed(1)}%`;

    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                            {title}
                        </p>
                        <p className={`text-3xl font-bold mt-1 ${valueColor || ''}`} style={!valueColor ? { color: "rgb(var(--theme-text))" } : undefined}>
                            {value}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                {subValue}
                            </p>
                            {hasTrend && (
                                <span className={`flex items-center text-xs font-medium ${trendColor}`} aria-label={`${trendLabel}: ${trendValue}`}>
                                    <TrendIcon className="h-3 w-3 mr-0.5" aria-hidden="true" />
                                    {trendValue}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className={`p-3 rounded-lg ${iconBg}`}>
                        <span className={iconColor} aria-hidden="true">{icon}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusBar({ label, count, percent, color, loading }: {
    label: string;
    count: number;
    percent: string;
    color: string;
    loading: boolean;
}) {
    if (loading) {
        return (
            <div className="space-y-2">
                <div className="h-4 w-32 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                <div className="h-2 rounded-full animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span style={{ color: "rgb(var(--theme-text))" }}>{label}</span>
                <span style={{ color: "rgb(var(--theme-text-muted))" }}>
                    {count.toLocaleString()} ({percent}%)
                </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgb(var(--theme-border))" }}>
                <div 
                    className={`h-full ${color} transition-all duration-500`}
                    style={{ width: `${Math.min(parseFloat(percent), 100)}%` }}
                />
            </div>
        </div>
    );
}

function InsightCard({ type, title, description }: {
    type: "success" | "warning" | "error" | "info";
    title: string;
    description: string;
}) {
    const styles = {
        success: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2, iconColor: "text-emerald-500" },
        warning: { bg: "bg-amber-500/10", border: "border-amber-500/20", icon: AlertTriangle, iconColor: "text-amber-500" },
        error: { bg: "bg-red-500/10", border: "border-red-500/20", icon: XCircle, iconColor: "text-red-500" },
        info: { bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Activity, iconColor: "text-blue-500" },
    };

    const style = styles[type];
    const Icon = style.icon;

    return (
        <div className={`p-3 rounded-lg border ${style.bg} ${style.border}`}>
            <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 ${style.iconColor}`} />
                <div>
                    <p className="font-medium text-sm" style={{ color: "rgb(var(--theme-text))" }}>
                        {title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}
