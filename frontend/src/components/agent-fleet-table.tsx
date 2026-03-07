"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    CheckCircle2, XCircle, AlertTriangle, Terminal, Trash2,
    RefreshCw, Copy, Check, Cpu, Globe, Search,
    Download, ExternalLink, Shield, ShieldOff,
    ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, FolderKanban, GitCompare, Server
} from "lucide-react";
import Link from "next/link";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { EnvironmentBadge } from "@/components/environment-tabs";

// Status thresholds (in seconds)
const STATUS_THRESHOLDS = {
    ONLINE: 180,   // 3 minutes
    STALE: 600,    // 10 minutes
};

type SortField = 'hostname' | 'ip' | 'version' | 'agent_version' | 'status' | 'last_seen';
type SortDirection = 'asc' | 'desc';

interface AgentFleetTableProps {
    instances: any[];
    loading: boolean;
    latestVersion: string;
    serverAssignments: Record<string, any>;
    selectedProject?: any;
    selectedEnvironment?: any;
    environments?: any[];
    selectedAgents: Set<string>;
    onSelectionChange: (selected: Set<string>) => void;
    onDelete?: (agent: any) => void;
    onUpdate?: (agentId: string) => void;
    onBulkDelete?: () => void;
    onBulkUpdate?: () => void;
    onTerminal?: (agent: any) => void;
}

function getAgentStatus(lastSeenTimestamp: number | null): { color: string; icon: any; label: string; dotColor: string; priority: number } {
    if (!lastSeenTimestamp) {
        return { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2, label: "Online", dotColor: "bg-emerald-500", priority: 3 };
    }
    const now = Math.floor(Date.now() / 1000);
    const secondsSinceLastSeen = now - lastSeenTimestamp;
    if (secondsSinceLastSeen < STATUS_THRESHOLDS.ONLINE) {
        return { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2, label: "Online", dotColor: "bg-emerald-500", priority: 3 };
    } else if (secondsSinceLastSeen < STATUS_THRESHOLDS.STALE) {
        return { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertTriangle, label: "Stale", dotColor: "bg-amber-500", priority: 2 };
    } else {
        return { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle, label: "Offline", dotColor: "bg-red-500", priority: 1 };
    }
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

export function AgentFleetTable({
    instances,
    loading,
    latestVersion,
    serverAssignments,
    selectedProject,
    selectedEnvironment,
    environments = [],
    selectedAgents,
    onSelectionChange,
    onDelete,
    onUpdate,
    onBulkDelete,
    onBulkUpdate,
    onTerminal
}: AgentFleetTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const searchQuery = searchParams.get('q') || "";
    const filterStatus = (searchParams.get('status') as "all" | "online" | "offline") || "all";
    const sortField = (searchParams.get('sort') as SortField) || 'status';
    const sortDirection = (searchParams.get('dir') as SortDirection) || 'asc';

    const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);

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

    const filteredInstances = useMemo(() => {
        let result = instances.filter(instance => {
            const matchesSearch =
                instance.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                instance.agent_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                instance.ip?.toLowerCase().includes(searchQuery.toLowerCase());

            // Filter by project/environment if selected
            if (selectedEnvironment) {
                const assignment = serverAssignments[instance.agent_id];
                if (!assignment || assignment.environment_id !== selectedEnvironment.id) {
                    return false;
                }
            } else if (selectedProject) {
                const assignment = serverAssignments[instance.agent_id];
                if (!assignment) return false;
                const envBelongsToProject = environments.some(env => env.id === assignment.environment_id);
                if (!envBelongsToProject) return false;
            }

            if (filterStatus === "all") return matchesSearch;

            const status = getAgentStatus(instance.last_seen);
            if (filterStatus === "online") return matchesSearch && status.label === "Online";
            if (filterStatus === "offline") return matchesSearch && status.label !== "Online";
            return matchesSearch;
        });

        result.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'hostname': comparison = (a.hostname || '').localeCompare(b.hostname || ''); break;
                case 'ip': comparison = (a.ip || a.pod_ip || '').localeCompare(b.ip || b.pod_ip || ''); break;
                case 'version': comparison = (a.version || '').localeCompare(b.version || ''); break;
                case 'agent_version': comparison = (a.agent_version || '').localeCompare(b.agent_version || ''); break;
                case 'status': comparison = getAgentStatus(a.last_seen).priority - getAgentStatus(b.last_seen).priority; break;
                case 'last_seen': comparison = (b.last_seen || 0) - (a.last_seen || 0); break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [instances, searchQuery, filterStatus, sortField, sortDirection, selectedProject, selectedEnvironment, environments, serverAssignments]);

    // Stats - computed from filtered instances
    const stats = useMemo(() => {
        const total = filteredInstances.length;
        const online = filteredInstances.filter(i => getAgentStatus(i.last_seen).label === "Online").length;
        const offline = total - online;
        const needsUpdate = filteredInstances.filter(i => i.agent_version !== latestVersion).length;
        return { total, online, offline, needsUpdate };
    }, [filteredInstances, latestVersion]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            updateParams({ dir: sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            updateParams({ sort: field, dir: 'asc' });
        }
    };

    const toggleSelectAll = () => {
        if (selectedAgents.size === filteredInstances.length) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(filteredInstances.map(i => i.agent_id)));
        }
    };

    const toggleSelectAgent = (agentId: string) => {
        const newSet = new Set(selectedAgents);
        if (newSet.has(agentId)) newSet.delete(agentId);
        else newSet.add(agentId);
        onSelectionChange(newSet);
    };

    const copyAgentId = (agentId: string) => {
        navigator.clipboard.writeText(agentId);
        setCopiedAgentId(agentId);
        toast.success("Agent ID copied");
        setTimeout(() => setCopiedAgentId(null), 2000);
    };

    const exportInventory = useCallback((format: 'json' | 'csv') => {
        const dataToExport = selectedAgents.size > 0
            ? filteredInstances.filter(i => selectedAgents.has(i.agent_id))
            : filteredInstances;

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `avika-inventory-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            const headers = ['hostname', 'agent_id', 'ip', 'version', 'agent_version', 'status', 'last_seen'];
            const csvRows = [headers.join(',')];

            dataToExport.forEach(instance => {
                const status = getAgentStatus(instance.last_seen);
                const row = [
                    instance.hostname || '',
                    instance.agent_id || '',
                    instance.ip || instance.pod_ip || '',
                    instance.version || '',
                    instance.agent_version || '',
                    status.label,
                    instance.last_seen ? new Date(instance.last_seen * 1000).toISOString() : 'N/A'
                ];
                csvRows.push(row.map(v => `"${v}"`).join(','));
            });

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `avika-inventory-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }

        toast.success(`Exported ${dataToExport.length} agents to ${format.toUpperCase()}`);
    }, [filteredInstances, selectedAgents]);

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Total Agents</p>
                                <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(var(--theme-text))' }}>{stats.total}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-500/10">
                                <Server className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Online</p>
                                <p className="text-3xl font-bold mt-1 text-emerald-500">{stats.online}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10">
                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Offline</p>
                                <p className="text-3xl font-bold mt-1 text-red-500">{stats.offline}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-red-500/10">
                                <XCircle className="h-6 w-6 text-red-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Needs Update</p>
                                <p className="text-3xl font-bold mt-1 text-amber-500">{stats.needsUpdate}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10">
                                <RefreshCw className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                        <input
                            type="text"
                            placeholder="Search agents..."
                            value={searchQuery}
                            onChange={(e) => updateParams({ q: e.target.value })}
                            className="pl-10 pr-4 py-2 text-sm rounded-lg border w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
 style={{ background: 'rgb(var(--theme-background))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                        />
                    </div>
                    <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'rgb(var(--theme-border))', background: 'rgb(var(--theme-background))' }}>
                        {(['all', 'online', 'offline'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => updateParams({ status: status === 'all' ? null : status })}
                                className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${filterStatus === status ? 'bg-blue-600 text-white' : 'hover:opacity-80'
                                    }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {selectedAgents.size > 0 && (
                        <div className="flex items-center gap-2 mr-2 pr-2 border-r" style={{ borderColor: 'rgb(var(--theme-border))' }}>
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                {selectedAgents.size} selected
                            </Badge>
                            {onBulkUpdate && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onBulkUpdate}
                                    className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 h-8 px-2"
                                >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                    Update
                                </Button>
                            )}
                            {onBulkDelete && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onBulkDelete}
                                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 px-2"
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    Remove
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => onSelectionChange(new Set())} style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Clear
                            </Button>
                        </div>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}>
                                <Download className="h-4 w-4 mr-2" />
                                Export
                                <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <DropdownMenuItem onClick={() => exportInventory('csv')} style={{ color: 'rgb(var(--theme-text))' }} className="focus:bg-opacity-80">
                                Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportInventory('json')} style={{ color: 'rgb(var(--theme-text))' }} className="focus:bg-opacity-80">
                                Export as JSON
                            </DropdownMenuItem>
                            {selectedAgents.size > 0 && (
                                <>
                                    <DropdownMenuSeparator style={{ borderColor: 'rgb(var(--theme-border))' }} />
                                    <DropdownMenuItem onClick={() => exportInventory('csv')} style={{ color: 'rgb(var(--theme-text-muted))' }} className="focus:bg-opacity-80">
                                        Export selected ({selectedAgents.size})
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'rgb(var(--theme-border))', background: 'rgb(var(--theme-surface))' }}>
                <Table>
                    <TableHeader style={{ background: 'rgb(var(--theme-background))' }}>
                        <TableRow className="hover:bg-transparent" style={{ borderColor: 'rgb(var(--theme-border))' }}>
                            <TableHead className="w-[40px]">
                                <input
                                    type="checkbox"
                                    checked={selectedAgents.size === filteredInstances.length && filteredInstances.length > 0}
                                    onChange={toggleSelectAll}
                                    className="rounded"
                                    style={{ borderColor: 'rgb(var(--theme-border))', background: 'rgb(var(--theme-surface))' }}
                                />
                            </TableHead>
                            <TableHead className="font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                <button onClick={() => handleSort('hostname')} className="flex items-center gap-1 rounded hover-surface transition-colors w-full text-left py-1 px-1 -mx-1">
                                    Agent
                                    {sortField === 'hostname' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                </button>
                            </TableHead>
                            <TableHead className="font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                <button onClick={() => handleSort('ip')} className="flex items-center gap-1 rounded hover-surface transition-colors w-full text-left py-1 px-1 -mx-1">
                                    IP Address
                                    {sortField === 'ip' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                </button>
                            </TableHead>
                            <TableHead className="font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>NGINX</TableHead>
                            <TableHead className="font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                <button onClick={() => handleSort('agent_version')} className="flex items-center gap-1 rounded hover-surface transition-colors w-full text-left py-1 px-1 -mx-1">
                                    Version
                                    {sortField === 'agent_version' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                </button>
                            </TableHead>
                            <TableHead className="font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Status</TableHead>
                            <TableHead className="font-medium whitespace-nowrap" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                <button onClick={() => handleSort('last_seen')} className="flex items-center gap-1 rounded hover-surface transition-colors w-full text-left py-1 px-1 -mx-1">
                                    Last Seen
                                    {sortField === 'last_seen' && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                </button>
                            </TableHead>
                            <TableHead className="text-right font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={8}>
                                        <div className="h-12 w-full animate-pulse rounded" style={{ background: 'rgb(var(--theme-surface) / 0.4)' }} />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : filteredInstances.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-40 text-center" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Server className="h-8 w-8 opacity-20" />
                                        <p>No agents found matching your filters.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredInstances.map((instance) => {
                                const statusInfo = getAgentStatus(instance.last_seen);
                                const needsUpdate = instance.agent_version !== latestVersion;
                                const isSelected = selectedAgents.has(instance.agent_id);

                                return (
                                    <TableRow key={instance.agent_id} className={`hover:opacity-95 ${isSelected ? 'bg-blue-500/5' : ''}`} style={{ borderColor: 'rgb(var(--theme-border))' }}>
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectAgent(instance.agent_id)}
                                                className="rounded" style={{ borderColor: 'rgb(var(--theme-border))', background: 'rgb(var(--theme-surface))' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${statusInfo.label === "Online" ? 'bg-emerald-500/10' : 'bg-gray-500/10'}`}>
                                                    <Cpu className={`h-4 w-4 ${statusInfo.label === "Online" ? 'text-emerald-500' : 'text-gray-500'}`} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Link href={`/servers/${instance.agent_id}`} className="font-medium link-theme transition-colors hover:underline">
                                                            {instance.hostname || "Unknown"}
                                                        </Link>
                                                        {instance.psk_authenticated && (
                                                            <Shield className="h-3.5 w-3.5 text-emerald-500" />
                                                        )}
                                                        {instance.is_pod && (
                                                            <Badge variant="outline" className="text-[10px] py-0 h-4" style={{ borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text-muted))', background: 'rgb(var(--theme-background))' }}>
                                                                K8s
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 group">
                                                        <button
                                                            onClick={() => copyAgentId(instance.agent_id)}
                                                            className="text-[10px] font-mono transition-colors hover:opacity-80" style={{ color: 'rgb(var(--theme-text-muted))' }}
                                                        >
                                                            {instance.agent_id?.substring(0, 12)}...
                                                        </button>
                                                        {copiedAgentId === instance.agent_id && <Check className="h-2.5 w-2.5 text-emerald-500" />}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                            {instance.ip || instance.pod_ip || "N/A"}
                                        </TableCell>
                                        <TableCell className="text-sm" style={{ color: 'rgb(var(--theme-text))' }}>
                                            {instance.version || "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm" style={{ color: 'rgb(var(--theme-text))' }}>{instance.agent_version || "N/A"}</span>
                                                {needsUpdate && (
                                                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Update</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`border-none ${statusInfo.color}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${statusInfo.dotColor}`} />
                                                {statusInfo.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                            {instance.last_seen ? formatLastSeen(instance.last_seen) : "N/A"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:opacity-80" style={{ color: 'rgb(var(--theme-text-muted))' }} asChild>
                                                    <Link href={`/servers/${instance.agent_id}`}>
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 hover:opacity-80" style={{ color: 'rgb(var(--theme-text-muted))' }}
                                                    onClick={() => onTerminal?.(instance)}
                                                >
                                                    <Terminal className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:opacity-80" style={{ color: 'rgb(var(--theme-text-muted))' }} asChild>
                                                    <Link href={`/servers/${encodeURIComponent(instance.agent_id)}?tab=drift`}>
                                                        <GitCompare className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                {onDelete && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:bg-red-500/10"
                                                        onClick={() => onDelete(instance)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
