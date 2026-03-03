"use client";

import { useEffect, useState } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { Shield, User, Globe, Clock, Info } from "lucide-react";

interface AuditLog {
    id: string;
    timestamp: string;
    username: string;
    action: string;
    resource_type: string;
    resource_id: string;
    details: any;
    ip_address: string;
    user_agent: string;
}

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await apiFetch("/api/audit?limit=100");
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data || []);
                } else {
                    const errData = await res.json();
                    setError(errData.message || "Failed to fetch audit logs");
                }
            } catch (err) {
                setError("Connection error");
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, []);

    const getActionColor = (action: string) => {
        if (action.includes("delete") || action.includes("revoke") || action.includes("unassign")) return "destructive";
        if (action.includes("create") || action.includes("add") || action.includes("grant")) return "success";
        if (action.includes("update") || action.includes("patch") || action.includes("provision")) return "blue";
        return "blue";
    };

    if (loading) return <div className="flex items-center justify-center h-64">Loading audit logs...</div>;
    if (error) return <div className="p-4 bg-red-500/10 text-red-400 rounded-lg">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Shield className="h-8 w-8 text-blue-500" />
                        Audit Logs
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Track administrative actions and security events across the Avika fleet.
                    </p>
                </div>
            </div>

            <Card className="border-border bg-surface shadow-xl overflow-hidden">
                <CardHeader className="border-b border-border py-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-400" />
                        Recent Activities (Last 100)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead className="w-[180px]">Timestamp</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Resource</TableHead>
                                <TableHead className="hidden md:table-cell">Details</TableHead>
                                <TableHead className="text-right">Origin</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No audit entries found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id} className="border-border hover:bg-white/5 transition-colors">
                                        <TableCell className="font-mono text-xs whitespace-nowrap">
                                            {format(new Date(log.timestamp), "MMM dd, HH:mm:ss")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                                    <User className="h-3 w-3 text-blue-400" />
                                                </div>
                                                <span className="font-medium">{log.username}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getActionColor(log.action) as any} className="capitalize">
                                                {log.action.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-muted-foreground uppercase">{log.resource_type}</span>
                                                <span className="font-mono text-xs max-w-[120px] truncate" title={log.resource_id}>
                                                    {log.resource_id}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {log.details ? (
                                                <div className="flex items-center gap-1">
                                                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={JSON.stringify(log.details, null, 2)}>
                                                        {JSON.stringify(log.details)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-mono flex items-center gap-1">
                                                    <Globe className="h-3 w-3" />
                                                    {log.ip_address}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground max-w-[100px] truncate" title={log.user_agent}>
                                                    {log.user_agent}
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
