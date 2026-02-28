"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    CheckCircle2, XCircle, AlertTriangle, Terminal, Trash2, 
    RefreshCw, Copy, Check, Server, Cpu, Globe, Search,
    Download, ExternalLink, Shield, ShieldOff,
    ArrowUpDown, ArrowUp, ArrowDown, ChevronDown
} from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// Status thresholds (in seconds) - could be made configurable
const STATUS_THRESHOLDS = {
    ONLINE: 180,   // 3 minutes
    STALE: 600,    // 10 minutes
};

type SortField = 'hostname' | 'ip' | 'version' | 'agent_version' | 'status' | 'last_seen';
type SortDirection = 'asc' | 'desc';

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

function InventoryPageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const [instances, setInstances] = useState<any[]>([]);
    const [latestVersion, setLatestVersion] = useState<string>("0.1.0");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedInstance, setSelectedInstance] = useState<any>(null);
    const [isExecDialogOpen, setIsExecDialogOpen] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    
    // URL-based state for persistence across refreshes
    const searchQuery = searchParams.get('q') || "";
    const filterStatus = (searchParams.get('status') as "all" | "online" | "offline") || "all";
    const sortField = (searchParams.get('sort') as SortField) || 'status';
    const sortDirection = (searchParams.get('dir') as SortDirection) || 'asc';
    
    // Helper to update URL params
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
    
    const setSortField = useCallback((value: SortField) => {
        updateParams({ sort: value === 'status' ? null : value });
    }, [updateParams]);
    
    const setSortDirection = useCallback((value: SortDirection) => {
        updateParams({ dir: value === 'asc' ? null : value });
    }, [updateParams]);
    
    // Bulk selection state
    const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
    
    // Delete confirmation state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState<any>(null);
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
    
    // Copied agent ID state (for tooltip)
    const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);

    // Stats
    const stats = useMemo(() => {
        const total = instances.length;
        const online = instances.filter(i => {
            const status = getAgentStatus(i.last_seen);
            return status.label === "Online";
        }).length;
        const offline = total - online;
        const needsUpdate = instances.filter(i => i.agent_version !== latestVersion).length;
        return { total, online, offline, needsUpdate };
    }, [instances, latestVersion]);

    // Filtered and sorted instances
    const filteredInstances = useMemo(() => {
        const result = instances.filter(instance => {
            const matchesSearch = 
                instance.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                instance.agent_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                instance.ip?.toLowerCase().includes(searchQuery.toLowerCase());
            
            if (filterStatus === "all") return matchesSearch;
            
            const status = getAgentStatus(instance.last_seen);
            if (filterStatus === "online") return matchesSearch && status.label === "Online";
            if (filterStatus === "offline") return matchesSearch && status.label !== "Online";
            return matchesSearch;
        });

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;
            
            switch (sortField) {
                case 'hostname':
                    comparison = (a.hostname || '').localeCompare(b.hostname || '');
                    break;
                case 'ip':
                    comparison = (a.ip || a.pod_ip || '').localeCompare(b.ip || b.pod_ip || '');
                    break;
                case 'version':
                    comparison = (a.version || '').localeCompare(b.version || '');
                    break;
                case 'agent_version':
                    comparison = (a.agent_version || '').localeCompare(b.agent_version || '');
                    break;
                case 'status':
                    const statusA = getAgentStatus(a.last_seen);
                    const statusB = getAgentStatus(b.last_seen);
                    comparison = statusA.priority - statusB.priority;
                    break;
                case 'last_seen':
                    const timeA = a.last_seen || Date.now() / 1000;
                    const timeB = b.last_seen || Date.now() / 1000;
                    comparison = timeB - timeA; // Most recent first
                    break;
            }
            
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [instances, searchQuery, filterStatus, sortField, sortDirection]);

    // Handle sort toggle
    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }, [sortField, sortDirection, setSortField, setSortDirection]);

    // Bulk selection handlers
    const toggleSelectAll = useCallback(() => {
        if (selectedAgents.size === filteredInstances.length) {
            setSelectedAgents(new Set());
        } else {
            setSelectedAgents(new Set(filteredInstances.map(i => i.agent_id)));
        }
    }, [filteredInstances, selectedAgents.size]);

    const toggleSelectAgent = useCallback((agentId: string) => {
        setSelectedAgents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(agentId)) {
                newSet.delete(agentId);
            } else {
                newSet.add(agentId);
            }
            return newSet;
        });
    }, []);

    // Copy agent ID to clipboard
    const copyAgentId = useCallback((agentId: string) => {
        navigator.clipboard.writeText(agentId);
        setCopiedAgentId(agentId);
        toast.success("Agent ID copied to clipboard");
        setTimeout(() => setCopiedAgentId(null), 2000);
    }, []);

    // Export functionality
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

    const fetchAgents = async () => {
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error('Failed to fetch agents');
            const data = await res.json();
            setInstances(Array.isArray(data.agents) ? data.agents : []);
            setLatestVersion(data.system_version || "0.1.0");
            setError(null);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 10000);
        return () => clearInterval(interval);
    }, []);

    // Confirm delete (opens dialog)
    const confirmDelete = useCallback((agent: any) => {
        setAgentToDelete(agent);
        setDeleteDialogOpen(true);
    }, []);

    // Execute delete after confirmation
    const deleteAgent = async (agentId: string) => {
        try {
            const res = await apiFetch(`/api/servers/${agentId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setInstances(prev => prev.filter(i => i.agent_id !== agentId));
            setSelectedAgents(prev => {
                const newSet = new Set(prev);
                newSet.delete(agentId);
                return newSet;
            });
            toast.success("Agent removed successfully");
        } catch (error: any) {
            toast.error("Failed to remove agent", { description: error.message });
        } finally {
            setDeleteDialogOpen(false);
            setAgentToDelete(null);
        }
    };

    // Bulk delete
    const bulkDeleteAgents = async () => {
        const toDelete = Array.from(selectedAgents);
        let successCount = 0;
        let failCount = 0;

        for (const agentId of toDelete) {
            try {
                const res = await apiFetch(`/api/servers/${agentId}`, { method: 'DELETE' });
                if (res.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        setInstances(prev => prev.filter(i => !selectedAgents.has(i.agent_id)));
        setSelectedAgents(new Set());
        setBulkDeleteDialogOpen(false);

        if (failCount === 0) {
            toast.success(`Successfully removed ${successCount} agents`);
        } else {
            toast.warning(`Removed ${successCount} agents, ${failCount} failed`);
        }
    };

    // Bulk update outdated agents
    const bulkUpdateAgents = async () => {
        const outdatedAgents = filteredInstances.filter(
            i => selectedAgents.has(i.agent_id) && i.agent_version !== latestVersion
        );
        
        let successCount = 0;
        let failCount = 0;

        for (const agent of outdatedAgents) {
            try {
                const res = await apiFetch(`/api/servers/${agent.agent_id}/update`, { method: 'POST' });
                if (res.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        if (failCount === 0) {
            toast.success(`Triggered update for ${successCount} agents`);
        } else {
            toast.warning(`Updated ${successCount} agents, ${failCount} failed`);
        }
    };

    const updateAgent = async (agentId: string) => {
        try {
            const res = await apiFetch(`/api/servers/${agentId}/update`, { method: 'POST' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to trigger update');
            }
            toast.success("Update triggered", { description: "Agent will update shortly" });
        } catch (error: any) {
            toast.error("Failed to update agent", { description: error.message });
        }
    };

    if (error && instances.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
                <div className="p-4 rounded-full" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
                    <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        Unable to load inventory
                    </h2>
                    <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {error}
                    </p>
                </div>
                <Button onClick={fetchAgents} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    const execCommand = selectedInstance ? `kubectl exec -it ${selectedInstance.hostname} -- /bin/bash` : "";

    return (
        <div className="space-y-6">
            {isTerminalOpen && selectedInstance && (
                <TerminalOverlay
                    agentId={selectedInstance.agent_id}
                    onClose={() => setIsTerminalOpen(false)}
                />
            )}
            
            <Dialog open={isExecDialogOpen} onOpenChange={setIsExecDialogOpen}>
                <DialogContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                            <Terminal className="h-5 w-5 text-blue-500" />
                            Access Pod Terminal
                        </DialogTitle>
                        <DialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Run this command to access the Kubernetes pod terminal
                        </DialogDescription>
                    </DialogHeader>
                    <div 
                        className="flex items-center p-3 rounded-lg border font-mono text-sm relative"
                        style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}
                    >
                        <code className="text-blue-400 break-all pr-10">{execCommand}</code>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="absolute right-2"
                            onClick={() => {
                                navigator.clipboard.writeText(execCommand);
                                setCopied(true);
                                toast.success("Copied to clipboard");
                                setTimeout(() => setCopied(false), 2000);
                            }}
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsExecDialogOpen(false);
                                setIsTerminalOpen(true);
                            }}
                        >
                            <Terminal className="h-4 w-4 mr-2" />
                            Web Terminal
                        </Button>
                        <Button onClick={() => setIsExecDialogOpen(false)}>
                            Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle style={{ color: "rgb(var(--theme-text))" }}>
                            Remove Agent
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Are you sure you want to remove <strong>{agentToDelete?.hostname || agentToDelete?.agent_id}</strong>? 
                            This action cannot be undone. The agent will need to be re-registered to appear in inventory again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => agentToDelete && deleteAgent(agentToDelete.agent_id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Agent
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <AlertDialogContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle style={{ color: "rgb(var(--theme-text))" }}>
                            Remove {selectedAgents.size} Agents
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Are you sure you want to remove <strong>{selectedAgents.size} agents</strong>? 
                            This action cannot be undone. All selected agents will be removed from the inventory.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={bulkDeleteAgents}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove {selectedAgents.size} Agents
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                        Inventory
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Manage your NGINX agent fleet
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Bulk Actions (shown when agents selected) */}
                    {selectedAgents.size > 0 && (
                        <div className="flex items-center gap-2 mr-2 pr-2 border-r" style={{ borderColor: "rgb(var(--theme-border))" }}>
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                {selectedAgents.size} selected
                            </Badge>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={bulkUpdateAgents}
                                disabled={!filteredInstances.some(i => selectedAgents.has(i.agent_id) && i.agent_version !== latestVersion)}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Update Selected
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setBulkDeleteDialogOpen(true)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Selected
                            </Button>
                        </div>
                    )}
                    
                    <Button variant="outline" size="sm" onClick={fetchAgents} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    
                    {/* Export Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-2" />
                                Export
                                <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <DropdownMenuItem 
                                onClick={() => exportInventory('csv')}
                                style={{ color: "rgb(var(--theme-text))" }}
                            >
                                Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={() => exportInventory('json')}
                                style={{ color: "rgb(var(--theme-text))" }}
                            >
                                Export as JSON
                            </DropdownMenuItem>
                            {selectedAgents.size > 0 && (
                                <>
                                    <DropdownMenuSeparator style={{ background: "rgb(var(--theme-border))" }} />
                                    <DropdownMenuItem 
                                        onClick={() => exportInventory('csv')}
                                        style={{ color: "rgb(var(--theme-text-muted))" }}
                                    >
                                        Export selected ({selectedAgents.size})
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Stats Cards */}
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
                                    Online
                                </p>
                                <p className="text-3xl font-bold mt-1 text-emerald-500">
                                    {stats.online}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10">
                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Offline
                                </p>
                                <p className="text-3xl font-bold mt-1" style={{ color: stats.offline > 0 ? "#ef4444" : "rgb(var(--theme-text))" }}>
                                    {stats.offline}
                                </p>
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
                                <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Needs Update
                                </p>
                                <p className="text-3xl font-bold mt-1" style={{ color: stats.needsUpdate > 0 ? "#f59e0b" : "rgb(var(--theme-text))" }}>
                                    {stats.needsUpdate}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10">
                                <RefreshCw className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Agent List */}
            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader className="pb-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Agent Fleet</CardTitle>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                {filteredInstances.length} of {instances.length} agents shown
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Enhanced Search Input */}
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search by hostname, IP, or agent ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-10 py-2.5 text-sm rounded-lg border-2 w-72 transition-all duration-200
                                        bg-slate-800/50 border-slate-600/50 text-white placeholder:text-slate-400
                                        hover:border-slate-500 hover:bg-slate-800/70
                                        focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-slate-800"
                                />
                                {/* Clear button */}
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-600/50 transition-colors"
                                        aria-label="Clear search"
                                    >
                                        <XCircle className="h-4 w-4 text-slate-400 hover:text-slate-200" />
                                    </button>
                                )}
                            </div>
                            
                            {/* Enhanced Filter Buttons */}
                            <div className="flex rounded-lg border-2 border-slate-600/50 overflow-hidden bg-slate-800/30">
                                {(['all', 'online', 'offline'] as const).map((status, idx) => (
                                    <button
                                        key={status}
                                        onClick={() => setFilterStatus(status)}
                                        className={`px-4 py-2.5 text-xs font-semibold capitalize transition-all duration-200 ${
                                            filterStatus === status 
                                                ? 'bg-blue-600 text-white shadow-lg' 
                                                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                                        } ${idx > 0 ? 'border-l border-slate-600/50' : ''}`}
                                    >
                                        {status === 'online' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />}
                                        {status === 'offline' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5" />}
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                            ))}
                        </div>
                    ) : filteredInstances.length === 0 ? (
                        <div className="text-center py-12">
                            <Server className="h-12 w-12 mx-auto mb-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
                            <p className="font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                {searchQuery ? "No agents match your search" : "No agents connected"}
                            </p>
                            <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                {searchQuery ? "Try a different search term" : "Deploy agents to see them here"}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                                    <TableHead className="w-[40px]">
                                        <input
                                            type="checkbox"
                                            checked={selectedAgents.size === filteredInstances.length && filteredInstances.length > 0}
                                            onChange={toggleSelectAll}
                                            className="rounded border-gray-400"
                                            aria-label="Select all agents"
                                        />
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('hostname')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by hostname"
                                        >
                                            Agent
                                            {sortField === 'hostname' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('ip')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by IP address"
                                        >
                                            IP Address
                                            {sortField === 'ip' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('version')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by NGINX version"
                                        >
                                            NGINX
                                            {sortField === 'version' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('agent_version')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by agent version"
                                        >
                                            Agent Version
                                            {sortField === 'agent_version' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('status')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by status"
                                        >
                                            Status
                                            {sortField === 'status' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>
                                        <button 
                                            onClick={() => handleSort('last_seen')}
                                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                                            style={{ color: "rgb(var(--theme-text-muted))" }}
                                            aria-label="Sort by last seen"
                                        >
                                            Last Seen
                                            {sortField === 'last_seen' ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInstances.map((instance) => {
                                    const statusInfo = getAgentStatus(instance.last_seen);
                                    const needsUpdate = instance.agent_version !== latestVersion;
                                    const isSelected = selectedAgents.has(instance.agent_id);

                                    return (
                                        <TableRow 
                                            key={instance.agent_id} 
                                            style={{ borderColor: "rgb(var(--theme-border))" }}
                                            className={isSelected ? 'bg-blue-500/5' : ''}
                                        >
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelectAgent(instance.agent_id)}
                                                    className="rounded border-gray-400"
                                                    aria-label={`Select ${instance.hostname}`}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${statusInfo.label === "Online" ? 'bg-emerald-500/10' : 'bg-slate-500/10'}`}>
                                                        <Cpu className={`h-4 w-4 ${statusInfo.label === "Online" ? 'text-emerald-500' : 'text-slate-500'}`} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <Link
                                                                href={`/servers/${instance.agent_id}`}
                                                                className="font-medium hover:text-blue-500 transition-colors"
                                                                style={{ color: "rgb(var(--theme-text))" }}
                                                            >
                                                                {instance.hostname || "Unknown"}
                                                            </Link>
                                                            {/* PSK Authentication Status */}
                                                            {instance.psk_authenticated ? (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <button 
                                                                            className="flex items-center"
                                                                            aria-label="PSK Authenticated"
                                                                        >
                                                                            <Shield className="h-3.5 w-3.5 text-emerald-500" />
                                                                        </button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent 
                                                                        className="w-auto p-2" 
                                                                        align="start"
                                                                        style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}
                                                                    >
                                                                        <div className="flex items-center gap-2 text-xs" style={{ color: "rgb(var(--theme-text))" }}>
                                                                            <Shield className="h-4 w-4 text-emerald-500" />
                                                                            <span>PSK Authenticated</span>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            ) : instance.psk_authenticated === false ? (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <button 
                                                                            className="flex items-center"
                                                                            aria-label="No PSK Authentication"
                                                                        >
                                                                            <ShieldOff className="h-3.5 w-3.5 text-amber-500" />
                                                                        </button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent 
                                                                        className="w-auto p-2" 
                                                                        align="start"
                                                                        style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}
                                                                    >
                                                                        <div className="flex items-center gap-2 text-xs" style={{ color: "rgb(var(--theme-text))" }}>
                                                                            <ShieldOff className="h-4 w-4 text-amber-500" />
                                                                            <span>No PSK - Unauthenticated</span>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            ) : null}
                                                            {/* K8s badge moved inline with hostname */}
                                                            {instance.is_pod && (
                                                                <Badge variant="outline" className="text-[10px] py-0 h-4">
                                                                    <Globe className="h-2.5 w-2.5 mr-1" />
                                                                    K8s
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {/* Agent ID with tooltip and copy */}
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button 
                                                                        className="text-xs font-mono hover:text-blue-400 transition-colors cursor-pointer"
                                                                        style={{ color: "rgb(var(--theme-text-muted))" }}
                                                                        aria-label="View full agent ID"
                                                                    >
                                                                        {instance.agent_id?.substring(0, 12)}...
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent 
                                                                    className="w-auto p-2" 
                                                                    align="start"
                                                                    style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <code 
                                                                            className="text-xs font-mono px-2 py-1 rounded"
                                                                            style={{ background: "rgb(var(--theme-background))", color: "rgb(var(--theme-text))" }}
                                                                        >
                                                                            {instance.agent_id}
                                                                        </code>
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-6 w-6"
                                                                            onClick={() => copyAgentId(instance.agent_id)}
                                                                        >
                                                                            {copiedAgentId === instance.agent_id ? (
                                                                                <Check className="h-3 w-3 text-emerald-500" />
                                                                            ) : (
                                                                                <Copy className="h-3 w-3" />
                                                                            )}
                                                                        </Button>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-sm" style={{ color: "rgb(var(--theme-text))" }}>
                                                    {instance.ip || instance.pod_ip || "N/A"}
                                                </span>
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text))" }}>
                                                {instance.version || "N/A"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm" style={{ color: "rgb(var(--theme-text))" }}>
                                                        {instance.agent_version || "N/A"}
                                                    </span>
                                                    {needsUpdate && (
                                                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                                            Update
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={statusInfo.color}>
                                                    <span className={`w-2 h-2 rounded-full mr-2 ${statusInfo.dotColor}`} />
                                                    {statusInfo.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {instance.last_seen
                                                    ? formatLastSeen(instance.last_seen)
                                                    : "Just now"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="sm" asChild>
                                                        <Link href={`/servers/${instance.agent_id}`}>
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            if (instance.is_pod) {
                                                                setSelectedInstance(instance);
                                                                setIsExecDialogOpen(true);
                                                            } else {
                                                                window.location.href = `ssh://${instance.ip}`;
                                                            }
                                                        }}
                                                    >
                                                        <Terminal className="h-4 w-4" />
                                                    </Button>
                                                    {needsUpdate && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => updateAgent(instance.agent_id)}
                                                        >
                                                            <RefreshCw className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => confirmDelete(instance)}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                                        aria-label={`Delete ${instance.hostname}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
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

// Loading skeleton for Suspense fallback
function InventoryPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div className="h-8 w-32 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    <div className="h-4 w-48 rounded animate-pulse mt-2" style={{ background: "rgb(var(--theme-border))" }} />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <Card key={i} style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardContent className="pt-6">
                            <div className="h-12 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardContent className="pt-6 space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-16 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export default function InventoryPage() {
    return (
        <Suspense fallback={<InventoryPageSkeleton />}>
            <InventoryPageContent />
        </Suspense>
    );
}
