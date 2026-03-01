"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Search, Filter, X, XCircle, FileSearch, Copy, Check } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";

export default function TracesPage() {
    const { selectedProject, selectedEnvironment } = useProject();
    const [traces, setTraces] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [window, setWindow] = useState("1h");
    const [statusFilter, setStatusFilter] = useState("");
    const [methodFilter, setMethodFilter] = useState("");
    const [uriSearch, setUriSearch] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(text);
            toast.success("Trace ID copied to clipboard");
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    useEffect(() => {
        fetchTraces();
    }, [window, statusFilter, methodFilter, selectedProject, selectedEnvironment]);

    const fetchTraces = async () => {
        setLoading(true);
        try {
            let url = `/api/traces?window=${window}&limit=50`;
            if (statusFilter) url += `&status=${statusFilter}`;
            if (methodFilter) url += `&method=${methodFilter}`;
            if (uriSearch) url += `&uri=${encodeURIComponent(uriSearch)}`;
            
            // Project/environment filtering
            if (selectedEnvironment) {
                url += `&environment_id=${selectedEnvironment.id}`;
            } else if (selectedProject) {
                url += `&project_id=${selectedProject.id}`;
            }

            const res = await fetch(url);
            const data = await res.json();
            setTraces(data.traces || []);
        } catch (error) {
            console.error("Failed to fetch traces:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchTraces();
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Request Traces</h2>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <CardTitle>Recent Traces</CardTitle>
                        {/* Time Range Selector - Grouped */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-400 mr-1">
                                <Clock className="inline h-3 w-3 mr-1" />
                                Range:
                            </span>
                            <div className="flex rounded-lg border-2 border-slate-600/50 overflow-hidden bg-slate-800/30">
                                {["5m", "15m", "1h", "6h", "24h"].map((w, idx) => (
                                    <button
                                        key={w}
                                        onClick={() => setWindow(w)}
                                        className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                                            window === w
                                                ? 'bg-blue-600 text-white shadow-lg'
                                                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                                        } ${idx > 0 ? 'border-l border-slate-600/50' : ''}`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Filter Section - Dark Theme Compatible */}
                    <div className="flex flex-col lg:flex-row gap-4 mb-6 bg-slate-800/30 p-4 rounded-lg border-2 border-slate-600/50">
                        {/* Search Input */}
                        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search by URI path (e.g., /api/users, /health)..."
                                    value={uriSearch}
                                    onChange={(e) => setUriSearch(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border-2 transition-all duration-200
                                        bg-slate-800/50 border-slate-600/50 text-white placeholder:text-slate-400
                                        hover:border-slate-500 hover:bg-slate-800/70
                                        focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-slate-800"
                                />
                                {/* Clear button for search */}
                                {uriSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setUriSearch("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-600/50 transition-colors"
                                        aria-label="Clear search"
                                    >
                                        <XCircle className="h-4 w-4 text-slate-400 hover:text-slate-200" />
                                    </button>
                                )}
                            </div>
                            <Button type="submit" size="sm" className="px-4 bg-blue-600 hover:bg-blue-700">
                                Search
                            </Button>
                        </form>

                        {/* Filters */}
                        <div className="flex items-center gap-3">
                            <div className="text-xs font-semibold text-slate-300 uppercase flex items-center gap-1.5">
                                <Filter className="h-4 w-4 text-slate-400" /> Filters:
                            </div>

                            {/* Method Filter */}
                            <select
                                className="h-10 w-[130px] rounded-lg border-2 px-3 py-1 text-sm font-medium transition-all duration-200 cursor-pointer
                                    bg-slate-800/50 border-slate-600/50 text-white
                                    hover:border-slate-500 hover:bg-slate-800/70
                                    focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                value={methodFilter}
                                onChange={(e) => setMethodFilter(e.target.value)}
                            >
                                <option value="">All Methods</option>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                                <option value="PATCH">PATCH</option>
                            </select>

                            {/* Status Filter */}
                            <select
                                className="h-10 w-[140px] rounded-lg border-2 px-3 py-1 text-sm font-medium transition-all duration-200 cursor-pointer
                                    bg-slate-800/50 border-slate-600/50 text-white
                                    hover:border-slate-500 hover:bg-slate-800/70
                                    focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">All Status</option>
                                <option value="200">200 OK</option>
                                <option value="201">201 Created</option>
                                <option value="4xx">4xx Errors</option>
                                <option value="403">403 Forbidden</option>
                                <option value="404">404 Not Found</option>
                                <option value="5xx">5xx Errors</option>
                                <option value="500">500 Server Error</option>
                                <option value="502">502 Bad Gateway</option>
                            </select>

                            {/* Clear All Filters */}
                            {(statusFilter || methodFilter || uriSearch) && (
                                <button
                                    onClick={() => {
                                        setStatusFilter("");
                                        setMethodFilter("");
                                        setUriSearch("");
                                    }}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200
                                        text-red-400 hover:bg-red-500/10 hover:text-red-300 border border-red-500/30 hover:border-red-500/50"
                                >
                                    <X className="h-3.5 w-3.5" /> Clear All
                                </button>
                            )}
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Trace ID</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>URI</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-16">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500"></div>
                                            <span className="text-sm text-slate-400">Loading traces...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : traces.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-16">
                                        <div className="flex flex-col items-center gap-3">
                                            <FileSearch className="h-12 w-12 text-slate-500" />
                                            <div className="text-sm font-medium text-slate-300">No traces found</div>
                                            <div className="text-xs text-slate-500 max-w-sm">
                                                No request traces found for the selected time range and filters. 
                                                Try adjusting the time window or clearing filters.
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : traces.map((trace) => {
                                const rootSpan = trace.spans?.[0];
                                if (!rootSpan) return null;

                                // gRPC returns nano strings in snake_case
                                const startTimeMs = parseInt(rootSpan.start_time) / 1000000;
                                const endTimeMs = parseInt(rootSpan.end_time) / 1000000;
                                const durationMs = endTimeMs - startTimeMs;

                                const status = rootSpan.attributes?.status || "200";
                                const isError = parseInt(status) >= 400;
                                const method = rootSpan.attributes?.method || "GET";
                                const uri = rootSpan.attributes?.uri || "/";

                                return (
                                    <TableRow key={trace.request_id} className="group hover:bg-muted/50 transition-colors">
                                        <TableCell className="whitespace-nowrap font-medium">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-3 h-3 text-muted-foreground" />
                                                {formatDistanceToNow(new Date(startTimeMs), { addSuffix: true })}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 group/id">
                                                <span 
                                                    className="font-mono text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
                                                    title={`Full ID: ${trace.request_id}\nClick to copy`}
                                                >
                                                    {trace.request_id.substring(0, 8)}...
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(trace.request_id)}
                                                    className="p-1 rounded opacity-0 group-hover/id:opacity-100 transition-opacity hover:bg-slate-700/50"
                                                    title="Copy full trace ID"
                                                >
                                                    {copiedId === trace.request_id ? (
                                                        <Check className="h-3 w-3 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="h-3 w-3 text-slate-400 hover:text-slate-200" />
                                                    )}
                                                </button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{method}</Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={uri}>
                                            <span className="font-mono text-xs">{uri}</span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={isError ? "destructive" : "secondary"}>
                                                {status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={durationMs > 500 ? "text-amber-500 font-medium" : ""}>
                                            {durationMs.toFixed(2)} ms
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/analytics/traces/${trace.request_id}`}>
                                                <Button variant="ghost" size="sm">
                                                    View <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
