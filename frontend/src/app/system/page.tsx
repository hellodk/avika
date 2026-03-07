"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Activity, Shield, Database, RefreshCw, Network, Globe,
    CheckCircle2, AlertCircle, Clock, ArrowUpRight,
    Server, HardDrive, Zap, TrendingUp,
    AlertTriangle, XCircle, Info
} from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";

interface SystemStats {
    total_agents: number;
    active_agents: number;
    total_requests: number;
    avg_response_time: number;
    uptime_percentage: number;
    data_throughput: number;
}

function SystemHealthPageContent() {
    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
    const [componentHealth, setComponentHealth] = useState<{ [key: string]: any }>({});
    const [error, setError] = useState<string | null>(null);

    const stats = useMemo(() => {
        const active = agents.filter(a => isOnline(a.last_seen)).length;
        const total = agents.length;
        return {
            active,
            total,
            uptimePercent: total > 0 ? ((active / total) * 100).toFixed(1) : "0",
        };
    }, [agents]);

    const infrastructure = useMemo(() => [
        {
            name: "API Gateway",
            description: "gRPC & HTTP ingestion",
            status: componentHealth.gateway?.status === 'healthy' ? 'healthy' : 'unknown',
            version: componentHealth.gateway?.version || latestVersion || 'N/A',
            latency: componentHealth.gateway?.latency ? `${componentHealth.gateway.latency}ms` : 'N/A',
            icon: Globe,
        },
        {
            name: "PostgreSQL",
            description: "Configuration & state",
            status: componentHealth.postgres?.connected ? 'healthy' : 'degraded',
            version: componentHealth.postgres?.version || 'N/A',
            latency: componentHealth.postgres?.latency ? `${componentHealth.postgres.latency}ms` : 'N/A',
            icon: Database,
        },
        {
            name: "ClickHouse",
            description: "Metrics & analytics TSDB",
            status: componentHealth.clickhouse?.connected ? 'healthy' : 'degraded',
            version: componentHealth.clickhouse?.version || 'N/A',
            latency: componentHealth.clickhouse?.latency ? `${componentHealth.clickhouse.latency}ms` : 'N/A',
            icon: HardDrive,
        },
        {
            name: "Agent Network",
            description: `${stats.active} of ${stats.total} nodes active`,
            status: stats.active === stats.total && stats.total > 0 ? 'healthy' : stats.active > 0 ? 'degraded' : 'critical',
            version: `${stats.total} nodes`,
            latency: systemStats?.avg_response_time ? `${systemStats.avg_response_time.toFixed(0)}ms avg` : 'N/A',
            icon: Network,
        },
    ], [componentHealth, stats, latestVersion, systemStats]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchAll = async () => {
        await Promise.all([
            fetchLatestVersion(),
            fetchAgents(),
            fetchComponentHealth(),
            fetchSystemStats()
        ]);
    };

    const fetchLatestVersion = async () => {
        try {
            const res = await apiFetch('/api/servers');
            if (res.ok) {
                const data = await res.json();
                if (data.system_version) setLatestVersion(data.system_version);
            }
        } catch { /* silent */ }
    };

    const fetchAgents = async () => {
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error('Failed to fetch agents');
            const data = await res.json();
            setAgents(data.agents || []);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchComponentHealth = async () => {
        try {
            const [healthRes, readyRes] = await Promise.all([
                apiFetch('/api/health').catch(() => null),
                apiFetch('/api/ready').catch(() => null)
            ]);

            if (healthRes?.ok) {
                const health = await healthRes.json();
                setComponentHealth(prev => ({
                    ...prev,
                    gateway: { status: health.status, version: health.version, latency: health.response_time_ms }
                }));
            }

            if (readyRes?.ok) {
                const ready = await readyRes.json();
                setComponentHealth(prev => ({
                    ...prev,
                    postgres: { connected: ready.database === 'connected' || ready.status === 'ready' },
                    clickhouse: { connected: ready.clickhouse === 'connected' || ready.status === 'ready' }
                }));
            }
        } catch { /* silent */ }
    };

    const fetchSystemStats = async () => {
        try {
            const res = await apiFetch('/api/stats');
            if (res.ok) setSystemStats(await res.json());
        } catch { /* silent */ }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40';
            case 'degraded': return 'bg-amber-500/25 text-amber-300 border-amber-500/40';
            case 'critical': return 'bg-red-500/25 text-red-300 border-red-500/40';
            default: return 'bg-slate-500/25 text-slate-300 border-slate-500/40';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'healthy': return 'Healthy';
            case 'degraded': return 'Degraded';
            case 'critical': return 'Critical';
            default: return 'Unknown';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy': return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
            case 'degraded': return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
            case 'critical': return <XCircle className="h-4 w-4" aria-hidden="true" />;
            default: return <Info className="h-4 w-4" aria-hidden="true" />;
        }
    };

    return (
        <div className="space-y-8 pb-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        System Overview
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Infrastructure health and agent fleet status
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge
                        variant="outline"
                        className={stats.active === stats.total && stats.total > 0
                            ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                            : "bg-amber-500/25 text-amber-300 border-amber-500/40"}
                        role="status"
                        aria-label={`${stats.active} of ${stats.total} agents online`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full mr-2 ${stats.active === stats.total && stats.total > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                            aria-hidden="true"
                        />
                        {stats.active}/{stats.total} Agents Online
                    </Badge>
                    <RefreshButton
                        loading={loading}
                        onRefresh={() => {
                            setLoading(true);
                            fetchAll().finally(() => setLoading(false));
                        }}
                        aria-label="Refresh system health"
                    />
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <Card className="border-red-500/20 bg-red-500/5">
                    <CardContent className="flex items-center gap-3 py-4">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <span className="text-red-600">{error}</span>
                        <Button variant="outline" size="sm" onClick={fetchAll} className="ml-auto">
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Total Agents
                                </p>
                                <p className="text-3xl font-bold mt-1" style={{ color: "rgb(var(--theme-text))" }}>
                                    {stats.total}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-500/10">
                                <Server className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Active Agents
                                </p>
                                <p className="text-3xl font-bold mt-1 text-emerald-500">
                                    {stats.active}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10">
                                <Activity className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Fleet Uptime
                                </p>
                                <p className="text-3xl font-bold mt-1" style={{ color: "rgb(var(--theme-text))" }}>
                                    {stats.uptimePercent}%
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-purple-500/10">
                                <TrendingUp className="h-6 w-6 text-purple-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    System Version
                                </p>
                                <p className="text-3xl font-bold mt-1" style={{ color: "rgb(var(--theme-text))" }}>
                                    {latestVersion || 'N/A'}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10">
                                <Zap className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Infrastructure Health */}
            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg" style={{ color: "rgb(var(--theme-text))" }}>
                                Infrastructure Health
                            </CardTitle>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Core system services and their current status
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: "rgb(var(--theme-text-muted))" }} role="img" aria-label="Status legend">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden />
                                Healthy
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden />
                                Warning
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden />
                                Down
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {infrastructure.map((item) => (
                            <div
                                key={item.name}
                                className="p-4 rounded-lg border transition-colors hover:border-blue-500/30"
                                style={{
                                    background: "rgb(var(--theme-background))",
                                    borderColor: "rgb(var(--theme-border))"
                                }}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="p-2 rounded-lg" style={{ background: "rgba(var(--theme-primary), 0.1)" }}>
                                        <item.icon className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={getStatusColor(item.status)}
                                        role="status"
                                        aria-label={`${item.name} status: ${getStatusLabel(item.status)}`}
                                    >
                                        {getStatusIcon(item.status)}
                                        <span className="ml-1 capitalize">{item.status}</span>
                                    </Badge>
                                </div>
                                <h3 className="font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                    {item.name}
                                </h3>
                                <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    {item.description}
                                </p>
                                <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    <span>v{item.version}</span>
                                    <span>•</span>
                                    <span>{item.latency}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Lower two-column: Service Uptime + Agent Fleet | Recent Events */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Service Uptime + Agent Fleet */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Service Uptime (Past 24 Hours) — placeholder until we have time-series */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base" style={{ color: "rgb(var(--theme-text))" }}>
                                        Service Uptime (Past 24 Hours)
                                    </CardTitle>
                                </div>
                                <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>All time</span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {infrastructure.slice(0, 3).map((item) => (
                                <div key={item.name} className="space-y-1.5">
                                    <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text))" }}>{item.name}</p>
                                    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "rgb(var(--theme-border))" }} role="img" aria-label={`${item.name} uptime`}>
                                        <div
                                            className="h-full rounded-l-full transition-colors"
                                            style={{
                                                width: item.status === "healthy" ? "100%" : item.status === "degraded" ? "85%" : "60%",
                                                background: item.status === "healthy" ? "rgb(16 185 129)" : item.status === "degraded" ? "rgb(245 158 11)" : "rgb(239 68 68)"
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Agent Fleet — status grid */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base" style={{ color: "rgb(var(--theme-text))" }}>
                                    Agent Fleet
                                </CardTitle>
                                <Button variant="ghost" size="sm" asChild>
                                    <Link href="/inventory" className="text-sm">
                                        View Inventory
                                        <ArrowUpRight className="h-4 w-4 ml-1 inline" />
                                    </Link>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-1.5 mb-3" role="img" aria-label={`${stats.active} of ${stats.total} agents online`}>
                                {agents.length === 0 ? (
                                    <span className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>No agents</span>
                                ) : agents.map((a, i) => (
                                    <Link
                                        key={a.id ?? i}
                                        href={`/servers/${a.id}`}
                                        className="w-8 h-8 rounded border flex-shrink-0 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent"
                                        style={{
                                            background: isOnline(a.last_seen) ? "rgb(16 185 129 / 0.25)" : "rgb(var(--theme-border))",
                                            borderColor: isOnline(a.last_seen) ? "rgb(16 185 129)" : "rgb(var(--theme-border))"
                                        }}
                                        title={a.hostname || a.agent_id || `Agent ${i + 1}`}
                                    />
                                ))}
                            </div>
                            <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                {stats.active} of {stats.total} agents online
                            </p>
                            <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Manage, update, and configure agents in the inventory.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Recent Events */}
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base" style={{ color: "rgb(var(--theme-text))" }}>
                                Recent Events
                            </CardTitle>
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/inventory" className="text-sm">View Inventory</Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-3 text-sm">
                            {agents.length === 0 && !loading ? (
                                <li style={{ color: "rgb(var(--theme-text-muted))" }}>No agents yet</li>
                            ) : (
                                agents.slice(0, 6).map((a, i) => {
                                    const online = isOnline(a.last_seen);
                                    return (
                                        <li key={a.id ?? i} className="flex items-center gap-3">
                                            <span
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ background: online ? "rgb(16 185 129)" : "rgb(239 68 68)" }}
                                                aria-hidden
                                            />
                                            <span style={{ color: "rgb(var(--theme-text))" }}>
                                                {a.hostname || a.agent_id || `Agent ${i + 1}`} {online ? "online" : "offline"}
                                            </span>
                                            <span className="tabular-nums text-xs ml-auto" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {a.last_seen != null ? formatLastSeen(a.last_seen) : "—"}
                                            </span>
                                        </li>
                                    );
                                })
                            )}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function isOnline(lastSeen: any) {
    if (!lastSeen) return true;
    const now = Math.floor(Date.now() / 1000);
    return (now - parseInt(lastSeen)) < 180;
}

function formatLastSeen(lastSeen: string | number) {
    const timestamp = typeof lastSeen === 'string' ? parseInt(lastSeen) : lastSeen;
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
}

function SystemHealthPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="h-8 w-48 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                ))}
            </div>
        </div>
    );
}

export default function SystemHealthPage() {
    return (
        <Suspense fallback={<SystemHealthPageSkeleton />}>
            <SystemHealthPageContent />
        </Suspense>
    );
}
