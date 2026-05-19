import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
    Server,
    Trash2,
    Loader2,
    Copy,
    Check,
    Terminal,
    PlugZap,
    AlertTriangle,
} from "lucide-react";
import { apiFetch, getBasePath } from "@/lib/api";
import { toast } from "sonner";

type ReachabilityState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ok"; version: string }
    | { status: "error"; message: string };

export function AgentManagement() {
    const [isDeletingAgents, setIsDeletingAgents] = useState(false);
    const [deletionMessage, setDeletionMessage] = useState("");
    const [origin, setOrigin] = useState<string>("");
    const [basePath, setBasePath] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [reachability, setReachability] = useState<ReachabilityState>({ status: "idle" });
    // Confirmation dialog state: null = closed, number = offline agent count to confirm
    const [pendingDeleteCount, setPendingDeleteCount] = useState<number | null>(null);
    const [offlineAgentIds, setOfflineAgentIds] = useState<string[]>([]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setOrigin(window.location.origin);
            setBasePath(getBasePath());
        }
    }, []);

    // The install command is a single URL — the /updates/install endpoint
    // generates a self-contained script with all values (UPDATE_SERVER,
    // GATEWAY_SERVER, INSECURE_CURL) baked in server-side.
    // -k is always present: harmless on valid certs, required for self-signed.
    const installScript = useMemo(() => {
        if (!origin) return "";
        return `curl -kfsSL ${origin}${basePath}/updates/install | sudo bash`;
    }, [origin, basePath]);

    const handleCopyInstall = async () => {
        try {
            await navigator.clipboard.writeText(installScript);
            setCopied(true);
            toast.success("Install command copied");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    const handleTestReachability = async () => {
        if (!origin) return;
        setReachability({ status: "checking" });
        const url = `${origin}${basePath}/updates/version.json`;
        try {
            const res = await fetch(url, { credentials: "omit" });
            if (!res.ok) {
                setReachability({
                    status: "error",
                    message: `HTTP ${res.status} from ${url}`,
                });
                return;
            }
            const data = await res.json().catch(() => ({}));
            setReachability({
                status: "ok",
                version: data?.version || "unknown",
            });
        } catch (err) {
            setReachability({
                status: "error",
                message: err instanceof Error ? err.message : "Network error",
            });
        }
    };

    // Step 1: fetch offline agents and show confirmation dialog
    const handleDeleteOfflineAgents = async () => {
        setIsDeletingAgents(true);
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error("Failed to fetch agents");
            const data = await res.json();
            const agents = data.agents || [];
            const now = Math.floor(Date.now() / 1000);
            const offline = agents.filter((a: any) => a.last_seen && (now - parseInt(a.last_seen)) > 600);
            if (offline.length === 0) {
                toast.info("No offline agents found", { description: "All agents are currently online." });
                return;
            }
            setOfflineAgentIds(offline.map((a: any) => a.agent_id || a.id).filter(Boolean));
            setPendingDeleteCount(offline.length);
        } catch (error: any) {
            toast.error("Could not fetch agents", { description: error.message });
        } finally {
            setIsDeletingAgents(false);
        }
    };

    // Step 2: user confirmed — actually delete
    const handleConfirmDelete = async () => {
        setIsDeletingAgents(true);
        setPendingDeleteCount(null);
        let deletedCount = 0;
        try {
            for (const id of offlineAgentIds) {
                const delRes = await apiFetch(`/api/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (delRes.ok) deletedCount++;
            }
            toast.success("Cleanup complete", { description: `Deleted ${deletedCount} offline agent${deletedCount !== 1 ? "s" : ""}.` });
        } catch (error: any) {
            toast.error("Cleanup failed", { description: error.message });
        } finally {
            setIsDeletingAgents(false);
            setOfflineAgentIds([]);
        }
    };

    return (
        <>
        <AlertDialog open={pendingDeleteCount !== null} onOpenChange={(open) => { if (!open) setPendingDeleteCount(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete {pendingDeleteCount} offline agent{pendingDeleteCount !== 1 ? "s" : ""}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently remove {pendingDeleteCount} agent{pendingDeleteCount !== 1 ? "s" : ""} that have been offline for more than 10 minutes.
                        Their configuration and history will be lost. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
                        Delete {pendingDeleteCount} agent{pendingDeleteCount !== 1 ? "s" : ""}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Agent Management</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* ── Install Agent ─────────────────────────────────────── */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                        <Label style={{ color: 'rgb(var(--theme-text))' }}>Install Agent</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Run this on any host to enroll it with this gateway.
                    </p>

                    {/* Install snippet */}
                    <div className="relative rounded-md border" style={{ borderColor: 'rgb(var(--theme-border))', backgroundColor: 'rgb(var(--theme-background))' }}>
                        <pre className="p-3 pr-12 text-xs overflow-x-auto font-mono whitespace-pre" style={{ color: 'rgb(var(--theme-text))' }}>
{installScript || "Loading..."}
                        </pre>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCopyInstall}
                            disabled={!installScript}
                            className="absolute top-2 right-2 h-7 w-7"
                            aria-label="Copy install command"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-[#16A34A] dark:text-[#4ADE80]" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                    </div>

                    {/* Reachability */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleTestReachability}
                            disabled={reachability.status === "checking" || !origin}
                            style={{ borderColor: 'rgb(var(--theme-border))' }}
                        >
                            {reachability.status === "checking" ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Testing...</>
                            ) : (
                                <><PlugZap className="h-3.5 w-3.5 mr-2" />Test Reachability</>
                            )}
                        </Button>
                        {reachability.status === "ok" && (
                            <span className="text-xs flex items-center gap-1 text-[#16A34A] dark:text-[#4ADE80]">
                                <Check className="h-3.5 w-3.5" />
                                Update server reachable — gateway v{reachability.version}
                            </span>
                        )}
                        {reachability.status === "error" && (
                            <span className="text-xs flex items-center gap-1 text-rose-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {reachability.message}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Cleanup ──────────────────────────────────────────── */}
                <div className="space-y-2">
                    <Label style={{ color: 'rgb(var(--theme-text))' }}>Cleanup</Label>
                    <p className="text-sm text-muted-foreground mb-2">Remove agents that are currently offline from the inventory.</p>
                    <Button
                        variant="destructive"
                        onClick={handleDeleteOfflineAgents}
                        disabled={isDeletingAgents}
                        className="w-full sm:w-auto"
                    >
                        {isDeletingAgents ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Cleaning up...
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Offline Agents
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
        </>
    );
}
