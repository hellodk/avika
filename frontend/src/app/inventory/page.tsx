"use client";

import { TerminalOverlay } from "@/components/TerminalOverlay";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { AgentFleetTable } from "@/components/agent-fleet-table";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    XCircle, RefreshCw, Terminal, Check, Copy, Trash2, FolderKanban
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function InventoryPageContent() {
    const { selectedProject, selectedEnvironment, environments } = useProject();

    const [instances, setInstances] = useState<any[]>([]);
    const [serverAssignments, setServerAssignments] = useState<Record<string, any>>({});
    const [latestVersion, setLatestVersion] = useState<string>("0.1.0");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedInstance, setSelectedInstance] = useState<any>(null);
    const [isExecDialogOpen, setIsExecDialogOpen] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

    // Delete confirmation state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState<any>(null);

    const fetchAgents = async () => {
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error('Failed to fetch agents');
            const data = await res.json();
            setInstances(Array.isArray(data.agents) ? data.agents : []);
            setError(null);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchServerAssignments = async () => {
        try {
            const res = await apiFetch('/api/server-assignments');
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data.assignments)) {
                const assignmentMap: Record<string, any> = {};
                for (const a of data.assignments) {
                    assignmentMap[a.agent_id] = a;
                }
                setServerAssignments(assignmentMap);
            }
        } catch (error) {
            console.error('Failed to fetch server assignments:', error);
        }
    };

    const fetchLatestAgentVersion = async () => {
        try {
            const res = await apiFetch('/api/updates/version');
            if (res.ok) {
                const data = await res.json();
                setLatestVersion(data.version || "0.0.0");
            }
        } catch (error) {
            console.error('Failed to fetch latest agent version:', error);
        }
    };

    useEffect(() => {
        fetchAgents();
        fetchServerAssignments();
        fetchLatestAgentVersion();
        const interval = setInterval(() => {
            fetchAgents();
            fetchServerAssignments();
            fetchLatestAgentVersion();
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    const deleteAgent = async (agentId: string) => {
        try {
            const res = await apiFetch(`/api/servers/${agentId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setInstances(prev => prev.filter(i => i.agent_id !== agentId));
            toast.success("Agent removed successfully");
        } catch (error: any) {
            toast.error("Failed to remove agent", { description: error.message });
        } finally {
            setDeleteDialogOpen(false);
            setAgentToDelete(null);
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

    const handleBulkDelete = async () => {
        if (selectedAgents.size === 0) return;

        // Show confirmation
        if (!window.confirm(`Are you sure you want to remove ${selectedAgents.size} agents?`)) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        for (const agentId of Array.from(selectedAgents)) {
            try {
                const res = await apiFetch(`/api/servers/${agentId}`, { method: 'DELETE' });
                if (res.ok) successCount++;
                else failCount++;
            } catch (error) {
                failCount++;
            }
        }

        toast.success(`Bulk remove completed`, {
            description: `Successfully removed ${successCount} agents. ${failCount} failed.`
        });

        setSelectedAgents(new Set());
        fetchAgents();
    };

    const handleBulkUpdate = async () => {
        if (selectedAgents.size === 0) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        for (const agentId of Array.from(selectedAgents)) {
            try {
                const res = await apiFetch(`/api/servers/${agentId}/update`, { method: 'POST' });
                if (res.ok) successCount++;
                else failCount++;
            } catch (error) {
                failCount++;
            }
        }

        toast.success(`Bulk update triggered`, {
            description: `Successfully triggered updates for ${successCount} agents. ${failCount} failed.`
        });

        setSelectedAgents(new Set());
    };

    if (error && instances.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
                <div className="p-4 rounded-full bg-red-500/10">
                    <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(var(--theme-text))' }}>Unable to load inventory</h2>
                    <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>{error}</p>
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
                <DialogContent style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2" style={{ color: 'rgb(var(--theme-text))' }}>
                            <Terminal className="h-5 w-5 text-blue-500" />
                            Access Pod Terminal
                        </DialogTitle>
                        <DialogDescription style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            Run this command to access the Kubernetes pod terminal
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center p-3 rounded-lg border font-mono text-sm relative" style={{ borderColor: 'rgb(var(--theme-border))', background: 'rgb(var(--theme-background))' }}>
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
                        <Button variant="outline" onClick={() => {
                            setIsExecDialogOpen(false);
                            setIsTerminalOpen(true);
                        }}>
                            <Terminal className="h-4 w-4 mr-2" />
                            Web Terminal
                        </Button>
                        <Button onClick={() => setIsExecDialogOpen(false)}>Done</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle style={{ color: 'rgb(var(--theme-text))' }}>Remove Agent</AlertDialogTitle>
                        <AlertDialogDescription style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            Are you sure you want to remove <strong>{agentToDelete?.hostname || agentToDelete?.agent_id}</strong>?
                            This action cannot be undone.
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

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: 'rgb(var(--theme-text))' }}>Inventory</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>Manage your NGINX agent fleet</p>
                        {(selectedProject || selectedEnvironment) && (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text-muted))' }}>
                                <FolderKanban className="h-3 w-3 mr-1" />
                                {selectedEnvironment ? `${selectedProject?.name} / ${selectedEnvironment.name}` : selectedProject?.name}
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <RefreshButton
                        loading={loading}
                        onRefresh={async () => {
                            setLoading(true);
                            await fetchAgents();
                        }}
                        aria-label="Refresh inventory"
                    />
                </div>
            </div>

            <AgentFleetTable
                instances={instances}
                loading={loading}
                latestVersion={latestVersion}
                serverAssignments={serverAssignments}
                selectedProject={selectedProject}
                selectedEnvironment={selectedEnvironment}
                environments={environments}
                selectedAgents={selectedAgents}
                onSelectionChange={setSelectedAgents}
                onDelete={(agent) => {
                    setAgentToDelete(agent);
                    setDeleteDialogOpen(true);
                }}
                onUpdate={updateAgent}
                onBulkDelete={handleBulkDelete}
                onBulkUpdate={handleBulkUpdate}
                onTerminal={(agent) => {
                    if (agent.is_pod) {
                        setSelectedInstance(agent);
                        setIsExecDialogOpen(true);
                    } else {
                        window.location.href = `ssh://${agent.ip}`;
                    }
                }}
            />
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
