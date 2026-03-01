"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend, Cell, Pie, PieChart } from "recharts";
import { useLiveMetrics } from "../LiveMetricsProvider";
import { useTheme } from "@/lib/theme-provider";
import { NginxMetricCards } from "../metric-cards";
import { TrafficHeatmap } from "../TrafficHeatmap";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']; // 2xx, 3xx, 4xx, 5xx

export function TrafficDashboard() {
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
        if (!liveData?.request_rate || liveData.request_rate.length === 0) return;

        const latest = liveData.request_rate[liveData.request_rate.length - 1];
        // Use UTC time for consistency with historical data
        const now = new Date();
        const utcTime = now.toISOString().slice(11, 19); // HH:MM:SS in UTC
        const point = {
            time: utcTime,
            requests: parseInt(latest.requests || 0),
            errors: parseInt(latest.errors || 0),
            "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0
        };

        liveData.status_distribution?.forEach((s: any) => {
            const code = parseInt(s.code);
            if (code >= 200 && code < 300) point["2xx"] += parseInt(s.count);
            else if (code >= 300 && code < 400) point["3xx"] += parseInt(s.count);
            else if (code >= 400 && code < 500) point["4xx"] += parseInt(s.count);
            else if (code >= 500) point["5xx"] += parseInt(s.count);
        });

        setHistory(prev => {
            const next = [...prev, point];
            if (next.length > 30) return next.slice(1);
            return next;
        });
    }, [liveData]);

    const latestSummary = liveData?.summary || {};
    const statusPieData = liveData?.status_distribution?.map((s: any) => ({
        name: s.code,
        value: parseInt(s.count)
    })) || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-sm font-medium text-slate-500">
                        {isConnected ? 'Real-time Traffic Stream' : 'Connecting...'}
                    </span>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-3">
                    <NginxMetricCards data={latestSummary} />
                </div>
                <div className="md:col-span-1">
                    <TrafficHeatmap
                        data={history}
                        keys={["2xx", "3xx", "4xx", "5xx"]}
                        title="Real-time Status"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Request Rate (RPS)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history}>
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
                                <Line type="monotone" dataKey="requests" name="Total Req" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusPieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    isAnimationActive={false}
                                >
                                    {statusPieData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
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
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
