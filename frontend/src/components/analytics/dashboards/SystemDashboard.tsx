"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useLiveMetrics } from "../LiveMetricsProvider";
import { useTheme } from "@/lib/theme-provider";
import { SystemMetricCards } from "../metric-cards";
import { Gauge } from "../Gauge";

export function SystemDashboard() {
    const { data: liveData, isConnected } = useLiveMetrics();
    const { theme } = useTheme();
    const isDark = theme === "dark";

    // Theme-aware colors
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const axisColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipText = isDark ? "#f8fafc" : "#0f172a";

    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!liveData?.system_metrics || liveData.system_metrics.length === 0) return;

        // Take the latest point from the arrived metrics
        const latestSys = liveData.system_metrics?.[liveData.system_metrics.length - 1] || {};
        const latestGw = liveData.gateway_metrics?.[liveData.gateway_metrics.length - 1] || {};

        // Use UTC time for consistency with historical data
        const now = new Date();
        const utcTime = now.toISOString().slice(11, 19); // HH:MM:SS in UTC
        const point = {
            time: utcTime,
            cpu: Number(latestSys.cpu_usage_percent || 0),
            memory: Number(latestSys.memory_usage_percent || 0),
            rx: Number(latestSys.network_rx_rate || 0) / 1024, // KB/s
            tx: Number(latestSys.network_tx_rate || 0) / 1024,  // KB/s
            eps: Number(latestGw.eps || 0)
        };

        setHistory(prev => {
            const next = [...prev, point];
            if (next.length > 30) return next.slice(1);
            return next;
        });
    }, [liveData]);

    const latestMetrics = liveData?.system_metrics?.[liveData.system_metrics.length - 1] || {};

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-sm font-medium text-slate-500">
                        {isConnected ? 'Live Stream Active' : 'Connecting to Live Stream...'}
                    </span>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Resource Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-around items-center pt-0">
                        <Gauge
                            value={Number(latestMetrics.cpu_usage_percent || 0)}
                            label="CPU Load"
                            color="#6366f1"
                        />
                        <Gauge
                            value={Number(latestMetrics.memory_usage_percent || 0)}
                            label="Memory"
                            color="#f59e0b"
                        />
                    </CardContent>
                </Card>
                <div className="md:col-span-2">
                    <SystemMetricCards data={latestMetrics} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Gateway EPS (Events/sec)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                <XAxis dataKey="time" hide />
                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: tooltipBg,
                                        borderColor: gridColor,
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        color: tooltipText
                                    }}
                                    itemStyle={{ color: tooltipText }}
                                />
                                <Area type="monotone" dataKey="eps" name="EPS" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">CPU & Memory Usage (%)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                <XAxis dataKey="time" hide />
                                <YAxis domain={[0, 100]} stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: tooltipBg,
                                        borderColor: gridColor,
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        color: tooltipText
                                    }}
                                    itemStyle={{ color: tooltipText }}
                                />
                                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                                <Area type="monotone" dataKey="memory" name="Memory" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Network Throughput (KB/s)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                <XAxis dataKey="time" hide />
                                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: axisColor }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: tooltipBg,
                                        borderColor: gridColor,
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        color: tooltipText
                                    }}
                                    itemStyle={{ color: tooltipText }}
                                />
                                <Area type="monotone" dataKey="rx" name="RX" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                                <Area type="monotone" dataKey="tx" name="TX" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
