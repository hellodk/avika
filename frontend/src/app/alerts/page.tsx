"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bell, CheckCircle2, XCircle, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Alert {
    id: number | string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    timestamp: string;
    source: string;
    metric: string;
    status: "active" | "acknowledged" | "resolved";
}

// Skeleton loader component
function AlertSkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 rounded animate-pulse w-3/4" style={{ background: "rgb(var(--theme-border))" }} />
                        <div className="h-3 rounded animate-pulse w-full" style={{ background: "rgb(var(--theme-border))" }} />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex justify-between">
                    <div className="h-3 rounded animate-pulse w-1/3" style={{ background: "rgb(var(--theme-border))" }} />
                    <div className="h-3 rounded animate-pulse w-1/4" style={{ background: "rgb(var(--theme-border))" }} />
                </div>
            </CardContent>
        </Card>
    );
}

// Empty state component
function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="p-4 rounded-full" style={{ background: "rgba(var(--theme-primary), 0.1)" }}>
                <ShieldOff className="h-12 w-12" style={{ color: "rgb(var(--theme-primary))" }} />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                    No Alerts
                </h3>
                <p className="text-sm max-w-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Your system is running smoothly. No anomalies or issues have been detected.
                </p>
            </div>
        </div>
    );
}

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAlerts = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch("/api/alerts");
            if (!res.ok) {
                throw new Error(`Failed to fetch alerts: ${res.status}`);
            }
            const data = await res.json();
            
            // Handle different response shapes
            if (Array.isArray(data)) {
                setAlerts(data);
            } else if (data.alerts && Array.isArray(data.alerts)) {
                setAlerts(data.alerts);
            } else if (data.rules && Array.isArray(data.rules)) {
                // Transform alert rules to alert format
                setAlerts(data.rules.map((rule: any, idx: number) => ({
                    id: rule.id || idx,
                    severity: rule.severity || "info",
                    title: rule.name || "Alert",
                    description: rule.description || `${rule.metric} ${rule.operator} ${rule.threshold}`,
                    timestamp: rule.created_at || new Date().toISOString(),
                    source: "Alert Engine",
                    metric: rule.metric || "unknown",
                    status: rule.enabled ? "active" : "acknowledged"
                })));
            } else {
                setAlerts([]);
            }
        } catch (err: any) {
            console.error("Failed to fetch alerts:", err);
            setError(err.message || "Failed to load alerts");
            toast.error("Failed to load alerts", { description: err.message });
            setAlerts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchAlerts, 30000);
        return () => clearInterval(interval);
    }, []);

    const activeAlerts = alerts.filter(a => a.status === "active");

    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case "critical":
                return {
                    border: "border-l-rose-500",
                    badge: "bg-rose-500/20 text-rose-400 border-rose-500/30"
                };
            case "warning":
                return {
                    border: "border-l-amber-500",
                    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30"
                };
            default:
                return {
                    border: "border-l-blue-500",
                    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30"
                };
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "active":
                return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Active</Badge>;
            case "acknowledged":
                return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Acknowledged</Badge>;
            default:
                return (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Resolved
                    </Badge>
                );
        }
    };

    const formatTimestamp = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return timestamp;
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins} minutes ago`;
            if (diffHours < 24) return `${diffHours} hours ago`;
            if (diffDays < 7) return `${diffDays} days ago`;
            return date.toLocaleDateString();
        } catch {
            return timestamp;
        }
    };

    const criticalCount = alerts.filter(a => a.severity === "critical" && a.status === "active").length;
    const warningCount = alerts.filter(a => a.severity === "warning" && a.status === "active").length;
    const resolvedCount = alerts.filter(a => a.status === "resolved").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        Alerts
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        AI-driven anomaly detection and system alerts
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAlerts}
                        disabled={loading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>Total Alerts</p>
                                <p className="text-3xl font-bold mt-1" style={{ color: "rgb(var(--theme-text))" }}>{alerts.length}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-500/10">
                                <Bell className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>Critical</p>
                                <p className="text-3xl font-bold mt-1" style={{ color: criticalCount > 0 ? "#ef4444" : "rgb(var(--theme-text))" }}>{criticalCount}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-red-500/10">
                                <XCircle className="h-6 w-6 text-red-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>Warning</p>
                                <p className="text-3xl font-bold mt-1" style={{ color: warningCount > 0 ? "#f59e0b" : "rgb(var(--theme-text))" }}>{warningCount}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10">
                                <AlertTriangle className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>Resolved</p>
                                <p className="text-3xl font-bold mt-1 text-emerald-500">{resolvedCount}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10">
                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {loading ? (
                    // Show skeletons while loading
                    <>
                        <AlertSkeleton />
                        <AlertSkeleton />
                        <AlertSkeleton />
                    </>
                ) : alerts.length === 0 ? (
                    // Show empty state when no alerts
                    <EmptyState />
                ) : (
                    // Show alerts
                    alerts.map((alert) => {
                        const styles = getSeverityStyles(alert.severity);
                        return (
                            <Card 
                                key={alert.id} 
                                className={`border-l-4 ${styles.border}`}
                                style={{ 
                                    background: "rgb(var(--theme-surface))", 
                                    borderColor: "rgb(var(--theme-border))" 
                                }}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            {alert.severity === "critical" ? (
                                                <XCircle className="h-5 w-5 text-rose-500 mt-0.5" />
                                            ) : alert.severity === "warning" ? (
                                                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                                            ) : (
                                                <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
                                            )}
                                            <div className="space-y-1">
                                                <CardTitle className="text-base" style={{ color: "rgb(var(--theme-text))" }}>
                                                    {alert.title}
                                                </CardTitle>
                                                <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    {alert.description}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {getStatusBadge(alert.status)}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        <div className="flex items-center gap-4">
                                            <span className="font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                                Source: {alert.source}
                                            </span>
                                            <span className="font-mono">Metric: {alert.metric}</span>
                                        </div>
                                        <span>{formatTimestamp(alert.timestamp)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
