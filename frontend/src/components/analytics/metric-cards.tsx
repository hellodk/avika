import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, HardDrive, Network, Activity, Clock, TrendingUp, BarChart3 } from "lucide-react";

interface MetricCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ReactNode;
    trend?: {
        value: number;
        isUp: boolean;
    };
    colorClass?: string;
}

// Skeleton version of MetricCard for loading states - theme-aware
export const MetricCardSkeleton: React.FC = () => {
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
};

export const MetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    subValue,
    icon,
    trend,
    colorClass = "text-blue-400"
}) => {
    return (
        <Card 
            className="hover:border-opacity-70 transition-colors"
            style={{ 
                background: "rgb(var(--theme-surface))", 
                borderColor: "rgb(var(--theme-border))" 
            }}
        >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle 
                    className="text-sm font-medium"
                    style={{ color: "rgb(var(--theme-text-muted))" }}
                >
                    {title}
                </CardTitle>
                <div 
                    className={`${colorClass} p-2 rounded-lg`}
                    style={{ background: "rgba(var(--theme-border), 0.3)" }}
                >
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>{value}</div>
                {subValue && (
                    <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-dim))" }}>{subValue}</p>
                )}
                {trend && (
                    <p className={`text-xs mt-1 font-medium ${trend.isUp ? "text-emerald-400" : "text-red-400"}`}>
                        <span aria-label={trend.isUp ? "Trending up" : "Trending down"}>
                            {trend.isUp ? "↑" : "↓"}
                        </span> {Math.abs(trend.value)}% from prev
                    </p>
                )}
            </CardContent>
        </Card>
    );
};

export const SystemMetricCards = ({ data, loading }: { data: any; loading?: boolean }) => {
    if (loading) {
        return (
            <div className="grid gap-4 md:grid-cols-4">
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
                title="CPU Usage"
                value={`${Number(data.cpu_usage_percent || 0).toFixed(1)}%`}
                icon={<Cpu className="h-4 w-4" />}
                colorClass="text-indigo-400"
            />
            <MetricCard
                title="Memory Usage"
                value={`${Number(data.memory_usage_percent || 0).toFixed(1)}%`}
                subValue={`${(Number(data.memory_used_bytes || 0) / 1024 / 1024 / 1024).toFixed(1)} GB / ${(Number(data.memory_total_bytes || 0) / 1024 / 1024 / 1024).toFixed(1)} GB`}
                icon={<HardDrive className="h-4 w-4" />}
                colorClass="text-amber-400"
            />
            <MetricCard
                title="Network RX"
                value={formatRate(data.network_rx_rate)}
                subValue={`Total: ${formatBytes(data.network_rx_bytes)}`}
                icon={<TrendingUp className="h-4 w-4" />}
                colorClass="text-emerald-400"
            />
            <MetricCard
                title="Network TX"
                value={formatRate(data.network_tx_rate)}
                subValue={`Total: ${formatBytes(data.network_tx_bytes)}`}
                icon={<Activity className="h-4 w-4" />}
                colorClass="text-blue-400"
            />
        </div>
    );
};

export const NginxMetricCards = ({ data, loading }: { data: any; loading?: boolean }) => {
    if (loading) {
        return (
            <div className="grid gap-4 md:grid-cols-4">
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
                title="Active Connections"
                value={data.active_connections || 0}
                subValue={`${data.reading || 0} reading, ${data.writing || 0} writing`}
                icon={<Network className="h-4 w-4" />}
                colorClass="text-violet-400"
            />
            <MetricCard
                title="Waiting"
                value={data.waiting || 0}
                icon={<Clock className="h-4 w-4" />}
                colorClass="text-orange-400"
            />
            <MetricCard
                title="Requests/sec"
                value={Number(data.requests_per_second || 0).toFixed(1)}
                icon={<TrendingUp className="h-4 w-4" />}
                colorClass="text-cyan-400"
            />
            <MetricCard
                title="Total Requests"
                value={data.total_requests?.toLocaleString() || 0}
                icon={<BarChart3 className="h-4 w-4" />}
                colorClass="text-pink-400"
            />
        </div>
    );
};

const formatBytes = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return "0 B";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatRate = (rate: number) => {
    if (!rate || isNaN(rate)) return "0 B/s";
    if (rate >= 1024 * 1024) return (rate / 1024 / 1024).toFixed(1) + " MB/s";
    if (rate >= 1024) return (rate / 1024).toFixed(1) + " KB/s";
    return rate.toFixed(0) + " B/s";
};
