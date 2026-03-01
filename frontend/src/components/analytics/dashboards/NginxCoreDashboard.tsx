"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { useLiveMetrics } from "../LiveMetricsProvider";
import { useTheme } from "@/lib/theme-provider";
import { NginxMetricCards } from "../metric-cards";
import { Gauge } from "../Gauge";

export function NginxCoreDashboard() {
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
        if (!liveData?.summary) return;

        const latest = liveData.summary;
        // Use UTC time for consistency with historical data
        const now = new Date();
        const utcTime = now.toISOString().slice(11, 19); // HH:MM:SS in UTC
        const point = {
            time: utcTime,
            reading: parseInt(latest.reading || 0),
            writing: parseInt(latest.writing || 0),
            waiting: parseInt(latest.waiting || 0),
            active: parseInt(latest.active_connections || 0)
        };

        setHistory(prev => {
            const next = [...prev, point];
            if (next.length > 30) return next.slice(1);
            return next;
        });
    }, [liveData]);

    const latestSummary = liveData?.summary || {};

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-sm font-medium text-slate-500">
                        {isConnected ? 'NGINX Core Stream Active' : 'Connecting...'}
                    </span>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-center">Active Load</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center items-center py-2">
                        <Gauge
                            value={parseInt(latestSummary.active_connections || 0)}
                            max={1000}
                            label="Active Conns"
                            unit=""
                            color="#8b5cf6"
                        />
                    </CardContent>
                </Card>
                <div className="md:col-span-3">
                    <NginxMetricCards data={latestSummary} />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Connection States (Real-time)</CardTitle>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={history}>
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
                            <Legend />
                            <Bar dataKey="reading" name="Reading" stackId="a" fill="#3b82f6" isAnimationActive={false} />
                            <Bar dataKey="writing" name="Writing" stackId="a" fill="#10b981" isAnimationActive={false} />
                            <Bar dataKey="waiting" name="Waiting" stackId="a" fill="#f59e0b" isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
