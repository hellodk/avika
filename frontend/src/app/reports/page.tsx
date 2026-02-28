"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { TimeRangePicker, TimeRange } from "@/components/ui/time-range-picker";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme-provider";

// Skeleton components
function SummarySkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <div className="h-6 w-48 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="text-center space-y-2">
                            <div className="h-4 w-24 mx-auto rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                            <div className="h-8 w-20 mx-auto rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function ChartSkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <div className="h-5 w-32 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardHeader>
            <CardContent>
                <div className="h-[300px] rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
            </CardContent>
        </Card>
    );
}

export default function ReportsPage() {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    
    // Theme-aware chart colors
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const axisColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipBg = isDark ? "#1e293b" : "#ffffff";
    const tooltipText = isDark ? "#f8fafc" : "#0f172a";

    const [timeRange, setTimeRange] = useState<TimeRange>({
        type: 'relative',
        value: '7d',
        label: 'Last 7 days'
    });
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        try {
            let queryParams = '';
            if (timeRange.type === 'relative' && timeRange.value) {
                const now = new Date();
                let startTime = new Date(now.getTime());

                if (timeRange.value === '24h') {
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                } else if (timeRange.value === '7d') {
                    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                } else if (timeRange.value === '30d') {
                    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                }

                queryParams = `start=${Math.floor(startTime.getTime() / 1000)}&end=${Math.floor(now.getTime() / 1000)}`;
            } else if (timeRange.type === 'absolute' && timeRange.from && timeRange.to) {
                queryParams = `start=${Math.floor(timeRange.from.getTime() / 1000)}&end=${Math.floor(timeRange.to.getTime() / 1000)}`;
            }

            const res = await apiFetch(`/api/reports?${queryParams}`);
            if (!res.ok) throw new Error(`Failed to generate report: ${res.status}`);
            
            const data = await res.json();
            const mappedData = {
                summary: {
                    totalRequests: data.summary?.total_requests,
                    errorRate: data.summary?.error_rate,
                    totalBandwidth: data.summary?.total_bandwidth,
                    avgLatency: data.summary?.avg_latency,
                    uniqueVisitors: data.summary?.unique_visitors
                },
                trafficTrend: data.traffic_trend?.map((t: any) => ({
                    time: t.time,
                    requests: t.requests,
                    errors: t.errors
                })) || [],
                topUris: data.top_uris || [],
                topServers: data.top_servers || []
            };
            setReportData(mappedData);
            toast.success("Report generated", { description: `${timeRange.label} report ready` });
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            toast.error("Failed to generate report", { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    const downloadReport = () => {
        if (!reportData) return;
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `avika-report-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Report downloaded");
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
                        Reports
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Generate and export performance reports
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <TimeRangePicker value={timeRange} onChange={setTimeRange} />
                    <Button onClick={generateReport} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileText className="mr-2 h-4 w-4" />
                                Generate Report
                            </>
                        )}
                    </Button>
                    {reportData && (
                        <Button 
                            variant="outline" 
                            onClick={downloadReport}
                            style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
                        >
                            <Download className="mr-2 h-4 w-4" /> Export JSON
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="space-y-6 animate-in fade-in">
                    <SummarySkeleton />
                    <ChartSkeleton />
                    <div className="grid md:grid-cols-2 gap-6">
                        <ChartSkeleton />
                        <ChartSkeleton />
                    </div>
                </div>
            ) : reportData ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Executive Summary */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                                <Calendar className="h-5 w-5 text-blue-500" />
                                Executive Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-6 text-center">
                                <div>
                                    <p className="text-sm mb-1" style={{ color: "rgb(var(--theme-text-muted))" }}>Total Requests</p>
                                    <p className="text-3xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
                                        {(Number(reportData.summary?.totalRequests) || 0).toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm mb-1" style={{ color: "rgb(var(--theme-text-muted))" }}>Error Rate</p>
                                    <p className={`text-3xl font-bold ${(reportData.summary?.errorRate || 0) > 1 ? "text-rose-400" : "text-emerald-400"}`}>
                                        {(Number(reportData.summary?.errorRate) || 0).toFixed(2)}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm mb-1" style={{ color: "rgb(var(--theme-text-muted))" }}>Avg Latency</p>
                                    <p className="text-3xl font-bold text-amber-400">
                                        {(Number(reportData.summary?.avgLatency) || 0).toFixed(0)}ms
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm mb-1" style={{ color: "rgb(var(--theme-text-muted))" }}>Unique Visitors</p>
                                    <p className="text-3xl font-bold text-blue-400">
                                        {(Number(reportData.summary?.uniqueVisitors) || 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Traffic Trend */}
                    <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Traffic Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={reportData.trafficTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis dataKey="time" stroke={axisColor} fontSize={12} />
                                        <YAxis stroke={axisColor} fontSize={12} />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: tooltipBg, 
                                                border: `1px solid ${gridColor}`,
                                                borderRadius: "0.375rem",
                                                color: tooltipText
                                            }} 
                                            itemStyle={{ color: tooltipText }}
                                        />
                                        <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="Requests" />
                                        <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name="Errors" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top Lists */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Top URIs</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>URI</TableHead>
                                            <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Requests</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.topUris?.length > 0 ? (
                                            reportData.topUris.map((u: any, i: number) => (
                                                <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                                    <TableCell 
                                                        className="font-mono text-xs truncate max-w-[200px]" 
                                                        title={u.uri}
                                                        style={{ color: "rgb(var(--theme-text))" }}
                                                    >
                                                        {u.uri}
                                                    </TableCell>
                                                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                        {Number(u.requests).toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center py-4" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    No URI data available
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Top Servers</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                            <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Host</TableHead>
                                            <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Traffic</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.topServers?.length > 0 ? (
                                            reportData.topServers.map((s: any, i: number) => (
                                                <TableRow key={i} style={{ borderColor: "rgb(var(--theme-border))" }}>
                                                    <TableCell style={{ color: "rgb(var(--theme-text))" }}>{s.hostname}</TableCell>
                                                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                        {Number(s.requests).toLocaleString()} reqs
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center py-4" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    No server data available
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div 
                    className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed rounded-lg"
                    style={{ borderColor: "rgb(var(--theme-border))" }}
                >
                    <div 
                        className="p-4 rounded-full mb-4"
                        style={{ background: "rgba(var(--theme-primary), 0.1)" }}
                    >
                        <FileText className="h-12 w-12" style={{ color: "rgb(var(--theme-text-muted))" }} />
                    </div>
                    <h3 className="text-lg font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                        No Report Generated
                    </h3>
                    <p style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Select a date range and click "Generate Report"
                    </p>
                </div>
            )}
        </div>
    );
}
