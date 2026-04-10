import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Server,
    Trash2,
    Loader2,
    Copy,
    Check,
    Terminal,
    PlugZap,
    AlertTriangle,
    ShieldAlert,
} from "lucide-react";
import { apiFetch, getBasePath } from "@/lib/api";
import { useProject, Environment } from "@/lib/project-context";
import { toast } from "sonner";

const NONE_VALUE = "__none__";

type ReachabilityState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ok"; version: string }
    | { status: "error"; message: string };

interface InstallInfo {
    version?: string;
    tls_self_signed?: boolean;
}

export function AgentManagement() {
    const { projects, isLoading: projectsLoading } = useProject();

    const [isDeletingAgents, setIsDeletingAgents] = useState(false);
    const [deletionMessage, setDeletionMessage] = useState("");
    const [origin, setOrigin] = useState<string>("");
    const [basePath, setBasePath] = useState<string>("");
    const [copied, setCopied] = useState(false);

    // Project / environment selection drives the LABEL_* lines in the install snippet.
    const [selectedProjectId, setSelectedProjectId] = useState<string>(NONE_VALUE);
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [envsLoading, setEnvsLoading] = useState(false);
    const [selectedEnvId, setSelectedEnvId] = useState<string>(NONE_VALUE);

    // Backend-supplied install info: TLS detection + gateway version.
    const [installInfo, setInstallInfo] = useState<InstallInfo>({});

    // Test reachability state
    const [reachability, setReachability] = useState<ReachabilityState>({ status: "idle" });

    useEffect(() => {
        if (typeof window !== "undefined") {
            setOrigin(window.location.origin);
            setBasePath(getBasePath());
        }
    }, []);

    // Fetch backend install info (TLS self-signed flag, version)
    useEffect(() => {
        let cancelled = false;
        apiFetch("/api/system/install-info")
            .then((res) => (res.ok ? res.json() : null))
            .then((data: InstallInfo | null) => {
                if (!cancelled && data) setInstallInfo(data);
            })
            .catch(() => {
                /* non-fatal — snippet still works without install info */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Load environments when a project is picked
    useEffect(() => {
        if (selectedProjectId === NONE_VALUE) {
            setEnvironments([]);
            setSelectedEnvId(NONE_VALUE);
            return;
        }
        let cancelled = false;
        setEnvsLoading(true);
        apiFetch(`/api/projects/${selectedProjectId}/environments`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (cancelled) return;
                const envs: Environment[] = Array.isArray(data) ? data : [];
                setEnvironments(envs);
                // Default to production env if present, else first
                const prod = envs.find((e) => e.is_production);
                setSelectedEnvId(prod?.id ?? envs[0]?.id ?? NONE_VALUE);
            })
            .catch(() => {
                if (!cancelled) setEnvironments([]);
            })
            .finally(() => {
                if (!cancelled) setEnvsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedProjectId]);

    const selectedProject = useMemo(
        () => projects.find((p) => p.id === selectedProjectId) ?? null,
        [projects, selectedProjectId]
    );
    const selectedEnv = useMemo(
        () => environments.find((e) => e.id === selectedEnvId) ?? null,
        [environments, selectedEnvId]
    );

    // Loopback hosts almost certainly use a self-signed cert (or no cert at all
    // when accessed via the dev HTTPS proxy). Treat them as insecure regardless
    // of what the backend reports — in dev the cert is owned by the Next.js
    // server, not the gateway, so the backend self-signed check can't see it.
    const isLoopback = useMemo(() => {
        if (!origin) return false;
        try {
            const h = new URL(origin).hostname;
            return (
                h === "localhost" ||
                h === "127.0.0.1" ||
                h === "0.0.0.0" ||
                h === "::1"
            );
        } catch {
            return false;
        }
    }, [origin]);

    const useInsecureCurl = installInfo.tls_self_signed || isLoopback;

    const installScript = useMemo(() => {
        if (!origin) return "";
        // Compute gateway gRPC endpoint from current origin.
        // HTTPS deployments use port 443 (HAProxy multiplexes h2/gRPC on the same port).
        // HTTP deployments fall back to the explicit port if set, else 80.
        let gatewayHost = "";
        try {
            const u = new URL(origin);
            const port = u.port || (u.protocol === "https:" ? "443" : "80");
            gatewayHost = `${u.hostname}:${port}`;
        } catch {
            gatewayHost = "<gateway-host>:443";
        }
        const updateServer = `${origin}${basePath}/updates`;

        // Build the env-var lines that prefix `bash`.
        const envLines: string[] = [
            `UPDATE_SERVER=${updateServer}`,
            `GATEWAY_SERVER=${gatewayHost}`,
        ];
        if (selectedProject) {
            envLines.push(`PROJECT_SLUG=${selectedProject.slug}`);
            if (selectedEnv) {
                envLines.push(`ENVIRONMENT_SLUG=${selectedEnv.slug}`);
            }
        }
        if (useInsecureCurl) {
            envLines.push(`INSECURE_CURL=true`);
        }

        // Render: each env on its own indented line, all chained with `\` line continuations.
        const indent = "       ";
        const envBlock = envLines
            .map((line, i) => (i === 0 ? `  sudo ${line}` : `${indent}${line}`))
            .join(" \\\n");

        const curlFlags = useInsecureCurl ? "-kfsSL" : "-fsSL";
        return `curl ${curlFlags} ${updateServer}/deploy-agent.sh | \\\n${envBlock} \\\n${indent}bash`;
    }, [origin, basePath, selectedProject, selectedEnv, useInsecureCurl]);

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

    const handleDeleteOfflineAgents = async () => {
        setIsDeletingAgents(true);
        setDeletionMessage("");
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error("Failed to fetch agents");
            const data = await res.json();
            const agents = data.agents || [];

            // Get agents not seen in last 10 minutes (offline)
            const now = Math.floor(Date.now() / 1000);
            const offlineAgents = agents.filter((a: any) => {
                if (!a.last_seen) return false;
                return (now - parseInt(a.last_seen)) > 600;
            });

            if (offlineAgents.length === 0) {
                toast.info("No offline agents found", { description: "All agents are currently online." });
                setIsDeletingAgents(false);
                return;
            }

            let deletedCount = 0;
            for (const agent of offlineAgents) {
                const id = agent.agent_id || agent.id;
                if (!id) continue;
                const delRes = await apiFetch(`/api/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (delRes.ok) deletedCount++;
            }

            toast.success("Cleanup complete", { description: `Successfully deleted ${deletedCount} offline agents.` });
            setDeletionMessage(`Successfully deleted ${deletedCount} agents.`);
            setTimeout(() => setDeletionMessage(""), 3000);
        } catch (error: any) {
            console.error(error);
            toast.error("Cleanup failed", { description: error.message });
            setDeletionMessage("Error occurred during cleanup.");
        } finally {
            setIsDeletingAgents(false);
        }
    };

    return (
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
                    <p className="text-sm text-slate-500">
                        Run this command on a target host as root to enroll it with this gateway.
                    </p>

                    {/* Project / Environment selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Project
                            </Label>
                            <Select
                                value={selectedProjectId}
                                onValueChange={setSelectedProjectId}
                                disabled={projectsLoading}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Unclassified" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>Unclassified (none)</SelectItem>
                                    {projects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Environment
                            </Label>
                            <Select
                                value={selectedEnvId}
                                onValueChange={setSelectedEnvId}
                                disabled={selectedProjectId === NONE_VALUE || envsLoading || environments.length === 0}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder={envsLoading ? "Loading..." : "—"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {environments.length === 0 && (
                                        <SelectItem value={NONE_VALUE} disabled>
                                            No environments
                                        </SelectItem>
                                    )}
                                    {environments.map((e) => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.name}
                                            {e.is_production ? " (prod)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Self-signed / loopback warning */}
                    {useInsecureCurl && (
                        <div className="flex items-start gap-2 p-2 rounded-md text-xs" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid rgb(245, 158, 11)' }}>
                            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                            <span style={{ color: 'rgb(var(--theme-text))' }}>
                                {isLoopback
                                    ? <>Loopback / dev host detected — <code>INSECURE_CURL=true</code> and <code>-k</code> have been added so curl accepts the dev cert.</>
                                    : <>Gateway uses a self-signed cert — <code>INSECURE_CURL=true</code> and <code>-k</code> have been added so the install can complete. Use a real cert for production.</>}
                            </span>
                        </div>
                    )}

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
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                    </div>

                    {/* Reachability + helper */}
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
                            <span className="text-xs flex items-center gap-1 text-emerald-500">
                                <Check className="h-3.5 w-3.5" />
                                Update server reachable — gateway version {reachability.version}
                            </span>
                        )}
                        {reachability.status === "error" && (
                            <span className="text-xs flex items-center gap-1 text-rose-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {reachability.message}
                            </span>
                        )}
                    </div>

                    <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        Adjust <code>GATEWAY_SERVER</code> if your gRPC endpoint uses a different host or port than the HTTPS frontend.
                    </p>
                </div>

                {/* ── Cleanup ──────────────────────────────────────────── */}
                <div className="space-y-2">
                    <Label style={{ color: 'rgb(var(--theme-text))' }}>Cleanup</Label>
                    <p className="text-sm text-slate-500 mb-2">Remove agents that are currently offline from the inventory.</p>
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
                    {deletionMessage && (
                        <p className={`text-sm mt-2 ${deletionMessage.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}>
                            {deletionMessage}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
