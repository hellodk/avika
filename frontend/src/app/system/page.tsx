"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Activity, Shield, Database, RefreshCw, Cpu, Network, Globe,
    CheckCircle2, AlertCircle, Clock, Search, ArrowUpRight, Terminal,
    Server, HardDrive, Zap, TrendingUp, ChevronRight, ExternalLink,
    AlertTriangle, XCircle, Info
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

interface SystemStats {
    total_agents: number;
    active_agents: number;
    total_requests: number;
    avg_response_time: number;
    uptime_percentage: number;
    data_throughput: number;
}

function SystemHealthPageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
    const [componentHealth, setComponentHealth] = useState<{ [key: string]: any }>({});
    const [error, setError] = useState<string | null>(null);
    const [updatingAgent, setUpdatingAgent] = useState<string | null>(null);

    // URL-based state for persistence
    const searchQuery = searchParams.get('q') || "";
    const filterStatus = (searchParams.get('status') as "all" | "online" | "offline") || "all";

    const updateParams = useCallback((updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === "") {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const setSearchQuery = useCallback((value: string) => {
        updateParams({ q: value || null });
    }, [updateParams]);

    const setFilterStatus = useCallback((value: "all" | "online" | "offline") => {
        updateParams({ status: value === "all" ? null : value });
    }, [updateParams]);

    // Calculate stats
    const stats = useMemo(() => {
        const active = agents.filter(a => isOnline(a.last_seen)).length;
        const total = agents.length;
        return {
            active,
            total,
            uptimePercent: total > 0 ? ((active / total) * 100).toFixed(1) : "0",
        };
    }, [agents]);

    // Infrastructure components
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

    // Filtered agents
    const filteredAgents = useMemo(() => {
        return agents.filter(a => {
            const matchesSearch =
                a.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.agent_id?.toLowerCase().includes(searchQuery.toLowerCase());
            const online = isOnline(a.last_seen);
            if (filterStatus === "online") return matchesSearch && online;
            if (filterStatus === "offline") return matchesSearch && !online;
            return matchesSearch;
        });
    }, [agents, searchQuery, filterStatus]);

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

    const triggerUpdate = async (agentId: string) => {
        setUpdatingAgent(agentId);
        try {
            const res = await apiFetch(`/api/servers/${agentId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_agent' })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success('Update command sent', { description: 'Agent will update and restart' });
            } else {
                toast.error('Update failed', { description: data.error || 'Unknown error' });
            }
        } catch (e: any) {
            toast.error('Update failed', { description: e.message });
        }
        setTimeout(() => setUpdatingAgent(null), 3000);
    };

    // IMPROVED CONTRAST: Increased opacity from 15% to 25% for better visibility
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40';
            case 'degraded': return 'bg-amber-500/25 text-amber-300 border-amber-500/40';
            case 'critical': return 'bg-red-500/25 text-red-300 border-red-500/40';
            default: return 'bg-slate-500/25 text-slate-300 border-slate-500/40';
        }
    };

    // Get human-readable status label for accessibility
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
                    <Link
                        href="/system/preview"
                        className="text-sm hover:underline"
                        style={{ color: "rgb(var(--theme-text-muted))" }}
                    >
                        Preview new layout
                    </Link>
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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAll}
                        style={{ borderColor: "rgb(var(--theme-border))" }}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
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
                    <CardTitle className="text-lg" style={{ color: "rgb(var(--theme-text))" }}>
                        Infrastructure Components
                    </CardTitle>
                    <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Core system services and their current status
                    </CardDescription>
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

// Suspense fallback skeleton
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
