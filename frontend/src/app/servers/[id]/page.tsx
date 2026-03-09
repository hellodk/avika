"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { FileCode, Save, RotateCcw, CheckCircle2, AlertTriangle, Shield, FileText, RefreshCw, Play, Square, RotateCcwIcon, Construction, Plus, Trash2, BarChart3, Activity, Terminal, Copy, Check, Settings, Server, Network, Zap, Globe, Info, GitCompare, Download, Search, X } from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";
import Link from "next/link";
import { useState, useEffect, use, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { apiFetch, apiUrl } from "@/lib/api";

interface LogEntry {
    timestamp?: number | string;
    level?: string;
    message: string;
    status?: number;
    request_method?: string;
    request_uri?: string;
    formattedTime?: string;
    remote_addr?: string;
    content?: string;
}

const TAB_VALUES = ["config", "certs", "logs", "analytics", "uptime", "drift", "settings"] as const;

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tabFromUrl = searchParams.get("tab");
    const activeTab = (TAB_VALUES.includes(tabFromUrl as any) ? tabFromUrl : "config") as typeof TAB_VALUES[number];
    const setActiveTab = (v: string) => {
        const u = new URLSearchParams(searchParams.toString());
        u.set("tab", v);
        router.replace(`${pathname}?${u.toString()}`, { scroll: false });
    };
    const [serverInfo, setServerInfo] = useState<any>(null);
    const [config, setConfig] = useState("");
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(false);

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logType, setLogType] = useState<'access' | 'error'>('access');
    const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
    const [logClientIpFilter, setLogClientIpFilter] = useState('');
    const [logTimeWindowMins, setLogTimeWindowMins] = useState<number>(60);
    const [logStreaming, setLogStreaming] = useState(true);
    const [logTailLines, setLogTailLines] = useState(200);
    const [logSearch, setLogSearch] = useState('');
    const [logSearchMatchIndex, setLogSearchMatchIndex] = useState(-1);
    const logEventSourceRef = useRef<EventSource | null>(null);
    const [uptimeReports, setUptimeReports] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isExecDialogOpen, setIsExecDialogOpen] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    
    // Agent Configuration State
    const [agentConfig, setAgentConfig] = useState({
        gateway_addresses: [''],
        multi_gateway_mode: false,
        nginx_status_url: 'http://127.0.0.1/nginx_status',
        access_log_path: '/var/log/nginx/access.log',
        error_log_path: '/var/log/nginx/error.log',
        nginx_config_path: '/etc/nginx/nginx.conf',
        log_format: 'combined',
        log_level: 'info',
        health_port: 5026,
        mgmt_port: 5025,
        update_server: '',
        update_interval_seconds: 604800,
        metrics_interval_seconds: 1,
        heartbeat_interval_seconds: 1,
        enable_vts_metrics: true,
        enable_log_streaming: true,
        auto_apply_config: true,
    });
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [configLoading, setConfigLoading] = useState(false);
    const [configBackups, setConfigBackups] = useState<{ name: string; created_at: number }[]>([]);
    const [configBackupsLoading, setConfigBackupsLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);

    // Drift (per-group status for this server)
    const [driftGroups, setDriftGroups] = useState<{ group_id: string; group_name: string; report_id: string; status: string; baseline_type: string; diff_summary?: string; error_message?: string; created_at: number }[]>([]);
    const [driftLoading, setDriftLoading] = useState(false);

    // Real-time log analysis (sliding window from gateway)
    const [realtimeStats, setRealtimeStats] = useState<{
        window_sec: number;
        total_requests: number;
        total_errors: number;
        error_rate_pct: number;
        total_bytes: number;
        request_rate_per_sec?: number;
        top_endpoints?: { uri: string; requests: number; bytes: number }[];
    } | null>(null);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}`);
            const data = await res.json();
            setServerInfo(data);
            if (data.config) {
                setConfig(data.config.content);
            }
            if (data.certificates) {
                setCertificates(data.certificates);
            }
        } catch (err) {
            console.error("Failed to fetch server details", err);
            setServerInfo({ error: "Network or client error" });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAnalytics = async () => {
        try {
            const res = await apiFetch(`/api/analytics?agent_id=${encodeURIComponent(id)}&window=24h`);
            const data = await res.json();
            setAnalytics(data);
        } catch (err) {
            console.error("Failed to fetch analytics", err);
        }
    };

    const fetchAgentConfig = async () => {
        setConfigLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/config`);
            if (res.ok) {
                const data = await res.json();
                setAgentConfig(prev => ({
                    ...prev,
                    ...data,
                    gateway_addresses: data.gateway_addresses?.length ? data.gateway_addresses : [''],
                }));
            }
        } catch (err) {
            console.error("Failed to fetch agent config", err);
        } finally {
            setConfigLoading(false);
        }
    };

    const fetchConfigBackups = async () => {
        setConfigBackupsLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/config/backups`);
            if (res.ok) {
                const data = await res.json();
                setConfigBackups(data.backups || []);
            }
        } catch (err) {
            console.error("Failed to fetch config backups", err);
        } finally {
            setConfigBackupsLoading(false);
        }
    };

    const fetchDrift = async () => {
        setDriftLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/drift`);
            if (res.ok) {
                const data = await res.json();
                setDriftGroups(data.groups || []);
            } else {
                setDriftGroups([]);
            }
        } catch (err) {
            console.error("Failed to fetch drift", err);
            setDriftGroups([]);
        } finally {
            setDriftLoading(false);
        }
    };

    const restoreConfigBackup = async (backupName: string) => {
        setRestoreLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/config/restore`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backup_name: backupName }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Config restored", { description: data.message || "Agent restart may be required." });
                fetchAgentConfig();
                fetchConfigBackups();
            } else {
                toast.error("Restore failed", { description: data.error });
            }
        } catch (err: any) {
            toast.error("Restore failed", { description: err?.message });
        } finally {
            setRestoreLoading(false);
        }
    };

    const saveAgentConfig = async () => {
        setIsSavingConfig(true);
        try {
            const configToSave = {
                ...agentConfig,
                gateway_addresses: agentConfig.gateway_addresses.filter(addr => addr.trim() !== ''),
            };
            
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configToSave)
            });
            
            const result = await res.json();
            if (result.success) {
                toast.success("Agent configuration saved", {
                    description: result.requires_restart 
                        ? "Some changes require agent restart to take effect"
                        : "Configuration applied successfully"
                });
            } else {
                toast.error("Failed to save configuration", { description: result.error });
            }
        } catch (err: any) {
            toast.error("Failed to save configuration", { description: err.message });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const addGatewayAddress = () => {
        setAgentConfig(prev => ({
            ...prev,
            gateway_addresses: [...prev.gateway_addresses, '']
        }));
    };

    const removeGatewayAddress = (index: number) => {
        setAgentConfig(prev => ({
            ...prev,
            gateway_addresses: prev.gateway_addresses.filter((_, i) => i !== index)
        }));
    };

    const updateGatewayAddress = (index: number, value: string) => {
        setAgentConfig(prev => ({
            ...prev,
            gateway_addresses: prev.gateway_addresses.map((addr, i) => i === index ? value : addr)
        }));
    };

    const handleSync = () => {
        setIsSyncing(true);
        fetchDetails();
        fetchAnalytics();
        setTimeout(() => setIsSyncing(false), 1000);
    };

    const handleNginxAction = async (action: string) => {
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });
            const result = await res.json();
            if (result.success) {
                toast.success(`NGINX ${action} succeeded`);
            } else {
                const msg = result.error || result.message || `NGINX ${action} failed`;
                toast.error(`NGINX ${action} failed`, { description: msg });
            }
        } catch (err: any) {
            toast.error(`NGINX ${action} failed`, { description: err?.message || String(err) });
        }
    };

    const handleSaveConfig = async () => {
        try {
            const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "update_config", content: config })
            });
            const result = await res.json();
            if (result.success) {
                setIsEditing(false);
                fetchDetails();
            } else {
                console.error("Failed to save config:", result.error);
                alert("Failed to save: " + result.error);
            }
        } catch (err) {
            console.error("Failed to save config", err);
        }
    };

    const toggleMaintenance = () => {
        setMaintenanceMode(!maintenanceMode);
    };

    useEffect(() => {
        fetchDetails();
        fetchAnalytics();
        fetchAgentConfig();
        fetchConfigBackups();
        fetchDrift();

        if (!logStreaming) {
            setIsConnected(false);
            return () => { logEventSourceRef.current = null; };
        }

        const tail = logTailLines;
        const logsUrl = `${apiUrl("/api/servers/" + encodeURIComponent(id) + "/logs")}?follow=1&tail=${tail}&log_type=${logType}`;
        const eventSource = new EventSource(logsUrl);
        logEventSourceRef.current = eventSource;

        eventSource.addEventListener("connected", () => {
            setIsConnected(true);
        });

        eventSource.addEventListener("log", (event: MessageEvent) => {
            try {
                const newLog = JSON.parse(event.data) as LogEntry;
                const ts = (newLog.timestamp as number) || Math.floor(Date.now() / 1000);
                const date = new Date(ts * 1000);
                (newLog as any).formattedTime = date.toLocaleString();
                if (!newLog.message && newLog.content) (newLog as any).message = newLog.content;
                else if (!newLog.message) (newLog as any).message = `${newLog.request_method || ""} ${newLog.request_uri || ""} ${newLog.status ?? ""}`.trim() || "—";
                setLogs((prev) => [newLog, ...prev].slice(0, Math.max(500, logTailLines)));
            } catch (e) {
                console.error("Failed to parse log", e);
            }
        });

        eventSource.addEventListener("error", (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data || "{}");
                if (data.error) console.error("Log stream error:", data.error);
            } catch { /* no payload */ }
            setIsConnected(false);
            eventSource.close();
        });

        eventSource.addEventListener("end", () => {
            setIsConnected(false);
            eventSource.close();
        });

        eventSource.onerror = () => {
            setIsConnected(false);
            eventSource.close();
        };

        return () => {
            eventSource.close();
            logEventSourceRef.current = null;
        };
    }, [id, logType, logStreaming, logTailLines]);

    useEffect(() => {
        const fetchUptime = async () => {
            try {
                const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/uptime`);
                const data = await res.json();
                setUptimeReports(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Failed to fetch uptime", err);
            }
        };
        fetchUptime();
        const interval = setInterval(fetchUptime, 30000);
        return () => clearInterval(interval);
    }, [id]);

    // Poll real-time stats when Logs tab is active (sliding-window from gateway)
    useEffect(() => {
        if (activeTab !== "logs") return;
        const fetchRealtime = async () => {
            try {
                const res = await apiFetch(`/api/servers/${encodeURIComponent(id)}/realtime-stats?window=60`);
                if (res.ok) {
                    const data = await res.json();
                    setRealtimeStats(data);
                }
            } catch {
                setRealtimeStats(null);
            }
        };
        fetchRealtime();
        const interval = setInterval(fetchRealtime, 2500);
        return () => clearInterval(interval);
    }, [id, activeTab]);

    if (isLoading && !serverInfo) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (serverInfo?.error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6">
                <AlertTriangle className="h-12 w-12 text-amber-500" />
                <h2 className="text-lg font-semibold" style={{ color: `rgb(var(--theme-text))` }}>Failed to load server</h2>
                <p className="text-sm text-neutral-400 text-center max-w-md">{serverInfo.error}</p>
                <Button variant="outline" onClick={() => { setIsLoading(true); setServerInfo(null); fetchDetails(); }}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    const currentStatus = serverInfo?.status || "unknown";
    const execCommand = `kubectl exec -it ${serverInfo?.hostname} -- /bin/bash`;

    // Client-side log filters and search
    const filteredLogs = useMemo(() => {
        const now = Date.now() / 1000;
        const cutoff = now - logTimeWindowMins * 60;
        const searchLower = logSearch.trim().toLowerCase();
        return logs.filter((log) => {
            const ts = typeof log.timestamp === 'number' ? log.timestamp : (typeof log.timestamp === 'string' ? parseInt(log.timestamp, 10) : 0);
            if (logTimeWindowMins > 0 && ts > 0 && ts < cutoff) return false;
            const status = log.status ?? 0;
            if (logStatusFilter !== 'all') {
                if (logStatusFilter === '2xx' && (status < 200 || status >= 300)) return false;
                if (logStatusFilter === '4xx' && (status < 400 || status >= 500)) return false;
                if (logStatusFilter === '5xx' && status < 500) return false;
            }
            const ip = (log.remote_addr || '').trim();
            if (logClientIpFilter.trim()) {
                const f = logClientIpFilter.trim();
                if (f.includes('/')) {
                    const [subnet, prefixLen] = f.split('/');
                    const len = parseInt(prefixLen, 10) || 32;
                    if (!ipStartsWithCIDR(ip, subnet, len)) return false;
                } else if (!ip.startsWith(f)) return false;
            }
            if (searchLower) {
                const line = (log.message || log.content || '').toLowerCase();
                if (!line.includes(searchLower)) return false;
            }
            return true;
        });
    }, [logs, logStatusFilter, logClientIpFilter, logTimeWindowMins, logSearch]);

    const logSearchMatches = useMemo(() => {
        if (!logSearch.trim()) return [];
        const s = logSearch.trim().toLowerCase();
        return filteredLogs.map((log, i) => (log.message || log.content || '').toLowerCase().includes(s) ? i : -1).filter((i) => i >= 0);
    }, [filteredLogs, logSearch]);

    const goToSearchMatch = useCallback((delta: number) => {
        if (logSearchMatches.length === 0) return;
        setLogSearchMatchIndex((prev) => {
            const next = prev < 0 ? (delta >= 0 ? 0 : logSearchMatches.length - 1) : (prev + delta + logSearchMatches.length) % logSearchMatches.length;
            const el = document.getElementById(`log-line-${logSearchMatches[next]}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
        });
    }, [logSearchMatches]);

    const downloadLogs = useCallback(() => {
        const lines = filteredLogs.map((log) => `[${log.formattedTime || log.timestamp}] ${log.remote_addr || ''} ${log.message || log.content || ''}`.trim());
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `logs-${id}-${logType}-${new Date().toISOString().slice(0, 19)}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    }, [filteredLogs, id, logType]);

    function ipStartsWithCIDR(ip: string, subnet: string, prefixLen: number): boolean {
        const toInt = (s: string) => {
            const parts = s.trim().split('.').map((n) => parseInt(n, 10) >>> 0);
            if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return null;
            return (parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!;
        };
        const ipN = toInt(ip);
        const subN = toInt(subnet);
        if (ipN == null || subN == null) return ip === subnet;
        const bits = Math.min(Math.max(0, prefixLen), 32);
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (ipN & mask) === (subN & mask);
    }

    return (
        <div className="space-y-6">
            {isTerminalOpen && (
                <TerminalOverlay
                    agentId={id}
                    onClose={() => setIsTerminalOpen(false)}
                />
            )}
            <Dialog open={isExecDialogOpen} onOpenChange={setIsExecDialogOpen}>
                <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Terminal className="h-5 w-5 text-primary" />
                            Access Pod Terminal
                        </DialogTitle>
                        <DialogDescription className="text-neutral-400">
                            To access this Kubernetes pod, run the following command in your local terminal:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center space-x-2 bg-neutral-950 p-3 rounded-md border border-neutral-800 font-mono text-sm mt-2 group relative">
                        <code className="text-blue-400 break-all pr-8">
                            {execCommand}
                        </code>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="absolute right-1 top-1 h-8 w-8 hover-text-visible"
                            onClick={() => {
                                navigator.clipboard.writeText(execCommand);
                                setCopied(true);
                                toast.success("Command copied to clipboard");
                                setTimeout(() => setCopied(false), 2000);
                            }}
                        >
                            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className="flex justify-end mt-4 gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsExecDialogOpen(false);
                                setIsTerminalOpen(true);
                            }}
                            className="border-primary/50 text-white hover:bg-primary/10"
                        >
                            <Terminal className="h-4 w-4 mr-2" />
                            Launch Web Terminal
                        </Button>
                        <Button
                            onClick={() => setIsExecDialogOpen(false)}
                            className="bg-primary hover:bg-primary/90 text-white"
                        >
                            Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: `rgb(var(--theme-text))` }}>{serverInfo?.hostname || id}</h1>
                    <p className="text-sm mt-1" style={{ color: `rgb(var(--theme-text-muted))` }}>
                        NGINX {serverInfo?.version || "..."} • Uptime: {serverInfo?.uptime || "N/A"} • IP: {serverInfo?.ip}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {maintenanceMode && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                            <Construction className="h-3 w-3 mr-1" />
                            Maintenance Mode
                        </Badge>
                    )}
                    <Badge className={currentStatus === 'online' ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>
                        {currentStatus === 'online' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                        {currentStatus}
                    </Badge>
                </div>
            </div>

            {/* Control Panel */}
            <Card style={{ background: `rgb(var(--theme-surface))`, borderColor: `rgb(var(--theme-border))` }}>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                                {isSyncing ? 'Syncing...' : 'Sync All'}
                            </Button>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleNginxAction('reload')}
                                className="border-neutral-700 hover:bg-neutral-800"
                                style={{ color: `rgb(var(--theme-text))` }}
                            >
                                <RotateCcwIcon className="h-4 w-4 mr-2" />
                                Reload
                            </Button>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleNginxAction('restart')}
                                className="border-neutral-700 hover:bg-neutral-800"
                                style={{ color: `rgb(var(--theme-text))` }}
                            >
                                <Play className="h-4 w-4 mr-2" />
                                Restart
                            </Button>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleNginxAction('stop')}
                                className="border-red-700 hover:bg-red-900/20 text-red-400"
                            >
                                <Square className="h-4 w-4 mr-2" />
                                Stop
                            </Button>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    const isPod = serverInfo?.is_pod;
                                    if (isPod) {
                                        setIsExecDialogOpen(true);
                                    } else {
                                        window.location.href = `ssh://${serverInfo?.ip}`;
                                    }
                                }}
                                className="border-primary/50 hover:bg-primary/10 text-primary"
                            >
                                <Terminal className="h-4 w-4 mr-2" />
                                {serverInfo?.is_pod ? 'Exec' : 'SSH'}
                            </Button>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={toggleMaintenance}
                            className={maintenanceMode ? "border-amber-700 bg-amber-900/20 text-amber-400" : "border-neutral-700 hover:bg-neutral-800"}
                            style={!maintenanceMode ? { color: `rgb(var(--theme-text))` } : {}}
                        >
                            <Construction className="h-4 w-4 mr-2" />
                            {maintenanceMode ? 'Disable' : 'Enable'} Maintenance
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="border" style={{ background: `rgb(var(--theme-surface))`, borderColor: `rgb(var(--theme-border))` }}>
                    <TabsTrigger value="config" style={{ color: `rgb(var(--theme-text))` }}>
                        <FileCode className="h-4 w-4 mr-2" />
                        Configuration
                    </TabsTrigger>
                    <TabsTrigger value="certs" style={{ color: `rgb(var(--theme-text))` }}>
                        <Shield className="h-4 w-4 mr-2" />
                        Certificates
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="data-[state=active]:bg-neutral-800">
                        <FileText className="h-4 w-4 mr-2" />
                        Logs
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="data-[state=active]:bg-neutral-800">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics
                    </TabsTrigger>
                    <TabsTrigger value="uptime" className="data-[state=active]:bg-neutral-800">
                        <Activity className="h-4 w-4 mr-2" />
                        Uptime
                    </TabsTrigger>
                    <TabsTrigger value="drift" className="data-[state=active]:bg-neutral-800">
                        <GitCompare className="h-4 w-4 mr-2" />
                        Drift
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="data-[state=active]:bg-neutral-800">
                        <Settings className="h-4 w-4 mr-2" />
                        Agent Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="config">
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-white">nginx.conf</CardTitle>
                                <div className="flex gap-2">
                                    {isEditing ? (
                                        <>
                                            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="border-neutral-700 text-white">
                                                <RotateCcw className="h-4 w-4 mr-2" />
                                                Cancel
                                            </Button>
                                            <Button size="sm" onClick={handleSaveConfig} className="bg-blue-600 hover:bg-blue-700">
                                                <Save className="h-4 w-4 mr-2" />
                                                Save & Reload
                                            </Button>
                                        </>
                                    ) : (
                                        <Button size="sm" onClick={() => setIsEditing(true)} className="bg-blue-600 hover:bg-blue-700">
                                            <FileCode className="h-4 w-4 mr-2" />
                                            Edit Config
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={config}
                                onChange={(e) => setConfig(e.target.value)}
                                disabled={!isEditing}
                                className="font-mono text-sm bg-neutral-950 border-neutral-800 min-h-[400px] text-neutral-300"
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="certs">
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <CardTitle className="text-white">SSL/TLS Certificates</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {certificates.length === 0 && <div className="text-neutral-500 italic p-4">No certificates discovered on this host.</div>}
                                {certificates.map((cert, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                        <div>
                                            <div className="font-medium text-white">{cert.domain}</div>
                                            <div className="text-sm text-neutral-400">Issuer: {cert.issuer} • {cert.cert_path}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-neutral-300">Expires: {new Date(cert.expiry_timestamp * 1000).toLocaleDateString()}</div>
                                            <Badge className={cert.days_until_expiry < 30 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}>
                                                {cert.days_until_expiry < 30 && <AlertTriangle className="h-3 w-3 mr-1" />}
                                                {cert.days_until_expiry} days left
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="logs">
                    <Card className="bg-neutral-900 border-neutral-800" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Live Logs</CardTitle>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs whitespace-nowrap" style={{ color: "rgb(var(--theme-text-muted))" }}>Stream</Label>
                                        <Switch checked={logStreaming} onCheckedChange={setLogStreaming} />
                                    </div>
                                    <Select value={String(logTailLines)} onValueChange={(v) => setLogTailLines(Number(v))}>
                                        <SelectTrigger className="w-[90px] h-9" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="100">100 lines</SelectItem>
                                            <SelectItem value="200">200 lines</SelectItem>
                                            <SelectItem value="500">500 lines</SelectItem>
                                            <SelectItem value="1000">1000 lines</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={logType} onValueChange={(v: 'access' | 'error') => setLogType(v)}>
                                        <SelectTrigger className="w-[120px] h-9" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="access">Access</SelectItem>
                                            <SelectItem value="error">Error</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                                        <SelectTrigger className="w-[100px] h-9" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="2xx">2xx</SelectItem>
                                            <SelectItem value="4xx">4xx</SelectItem>
                                            <SelectItem value="5xx">5xx</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={String(logTimeWindowMins)} onValueChange={(v) => setLogTimeWindowMins(Number(v))}>
                                        <SelectTrigger className="w-[110px] h-9" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">All time</SelectItem>
                                            <SelectItem value="5">Last 5m</SelectItem>
                                            <SelectItem value="15">Last 15m</SelectItem>
                                            <SelectItem value="60">Last 1h</SelectItem>
                                            <SelectItem value="360">Last 6h</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        placeholder="IP or CIDR"
                                        value={logClientIpFilter}
                                        onChange={(e) => setLogClientIpFilter(e.target.value)}
                                        className="w-[140px] h-9 font-mono text-xs"
                                        style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}
                                    />
                                    <div className="flex items-center gap-1 border rounded-md pl-2 h-9" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))" }}>
                                        <Search className="h-4 w-4 shrink-0" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                        <Input
                                            placeholder="Search (Ctrl+F)"
                                            value={logSearch}
                                            onChange={(e) => { setLogSearch(e.target.value); setLogSearchMatchIndex(-1); }}
                                            className="border-0 w-[120px] h-8 font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                                            style={{ background: "transparent", color: "rgb(var(--theme-text))" }}
                                        />
                                        {logSearch.trim() && (
                                            <>
                                                <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                    {logSearchMatches.length > 0 ? `${logSearchMatchIndex >= 0 ? logSearchMatchIndex + 1 : "0"}/${logSearchMatches.length}` : "0"}
                                                </span>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToSearchMatch(-1)} title="Previous">↑</Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToSearchMatch(1)} title="Next">↓</Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setLogSearch(""); setLogSearchMatchIndex(-1); }} title="Clear"><X className="h-3.5 w-3.5" /></Button>
                                            </>
                                        )}
                                    </div>
                                    <Button variant="outline" size="sm" className="h-9 gap-1" onClick={downloadLogs} disabled={filteredLogs.length === 0}>
                                        <Download className="h-4 w-4" /> Download
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-9" onClick={() => setLogs([])}>Clear</Button>
                                </div>
                            </div>
                        </CardHeader>
                        {/* Real-time stats strip (sliding window from gateway) */}
                        <div className="px-6 pb-2 flex flex-wrap items-center gap-4 border-b" style={{ borderColor: "rgb(var(--theme-border))" }}>
                            <span className="text-xs font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>Live (last 60s)</span>
                            {realtimeStats ? (
                                <>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>Requests</span>
                                        <span className="font-mono text-sm font-semibold" style={{ color: "rgb(var(--theme-text))" }}>{realtimeStats.total_requests.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>Error rate</span>
                                        <span className={`font-mono text-sm font-semibold ${realtimeStats.error_rate_pct > 5 ? "text-amber-400" : ""}`} style={realtimeStats.error_rate_pct > 5 ? undefined : { color: "rgb(var(--theme-text))" }}>{realtimeStats.error_rate_pct.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>Req/s</span>
                                        <span className="font-mono text-sm font-semibold" style={{ color: "rgb(var(--theme-primary))" }}>{(realtimeStats.request_rate_per_sec ?? 0).toFixed(1)}</span>
                                    </div>
                                    {realtimeStats.top_endpoints?.[0] && (
                                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                                            <span className="text-xs shrink-0" style={{ color: "rgb(var(--theme-text-muted))" }}>Top</span>
                                            <span className="font-mono text-xs truncate" style={{ color: "rgb(var(--theme-text))" }} title={realtimeStats.top_endpoints[0].uri}>{realtimeStats.top_endpoints[0].uri}</span>
                                            <span className="text-xs shrink-0" style={{ color: "rgb(var(--theme-text-muted))" }}>({realtimeStats.top_endpoints[0].requests})</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <span className="text-xs italic" style={{ color: "rgb(var(--theme-text-muted))" }}>No data yet — stream logs to see live stats</span>
                            )}
                        </div>
                        <CardContent>
                            <div className="space-y-2 font-mono text-xs">
                                {logs.length === 0 && isConnected && <div className="italic" style={{ color: "rgb(var(--theme-text-muted))" }}>Waiting for logs...</div>}
                                {!logStreaming && logs.length === 0 && <div className="italic" style={{ color: "rgb(var(--theme-text-muted))" }}>Stream is off. Turn on to connect.</div>}
                                {logStreaming && !isConnected && logs.length === 0 && <div className="italic" style={{ color: "rgb(var(--theme-text-muted))" }}>Connecting to log stream...</div>}
                                {filteredLogs.length < logs.length && logs.length > 0 && (
                                    <div className="text-xs mb-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        Showing {filteredLogs.length} of {logs.length} entries (filters applied)
                                    </div>
                                )}
                                {filteredLogs.map((log, idx) => (
                                    <div
                                        key={idx}
                                        id={`log-line-${idx}`}
                                        className={`p-2 rounded ${(log.status ?? 0) >= 400 ? 'bg-red-500/10 text-red-400' : ''} ${logSearchMatchIndex >= 0 && logSearchMatches[logSearchMatchIndex] === idx ? 'ring-1 ring-primary' : ''}`}
                                        style={{ color: (log.status ?? 0) >= 400 ? undefined : "rgb(var(--theme-text-muted))" }}
                                    >
                                        <span className="opacity-80">[{log.formattedTime || log.timestamp}]</span> {log.remote_addr && <span className="text-neutral-500">{log.remote_addr} </span>}{log.message}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics">
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Total Requests</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-white">{analytics?.summary?.total_requests?.toLocaleString() || "0"}</div>
                                    <p className="text-xs text-neutral-500 mt-1">Last 24h</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Avg Latency</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-blue-400">{analytics?.summary?.avg_latency?.toFixed(2) || "0"} ms</div>
                                    <p className="text-xs text-neutral-500 mt-1">Response time</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Error Rate</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-amber-400">{analytics?.summary?.error_rate?.toFixed(2) || "0"}%</div>
                                    <p className="text-xs text-neutral-500 mt-1">4xx & 5xx</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-400">Bandwidth</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-400">
                                        {analytics?.summary?.total_bandwidth > 1024 * 1024
                                            ? `${(analytics.summary.total_bandwidth / (1024 * 1024)).toFixed(2)} MB`
                                            : `${(analytics?.summary?.total_bandwidth / 1024).toFixed(2) || "0"} KB`
                                        }
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-1">Data served</p>
                                </CardContent>
                            </Card>
                        </div>
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader><CardTitle className="text-white">Top URLs (Last 24h)</CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {!analytics?.top_endpoints?.length && <div className="text-neutral-500 italic">No traffic data available.</div>}
                                    {analytics?.top_endpoints?.map((stat: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                            <div className="flex-1">
                                                <div className="font-mono text-sm text-white">{stat.uri}</div>
                                                <div className="text-xs text-neutral-500 mt-1">{stat.requests.toLocaleString()} requests</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-xs text-neutral-400">P95</div>
                                                    <Badge className={stat.p95 > 200 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}>
                                                        {stat.p95?.toFixed(0)}ms
                                                    </Badge>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-neutral-400">Errors</div>
                                                    {stat.errors > 0 ? <Badge className="bg-red-500/10 text-red-400 border-red-500/20">{stat.errors}</Badge> : <span className="text-neutral-500 text-sm">0</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="uptime">
                    <div className="space-y-4">
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Latency Trend (ms)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={[...uptimeReports].reverse()}>
                                            <XAxis
                                                dataKey="timestamp"
                                                hide
                                            />
                                            <YAxis
                                                stroke="#525252"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626" }}
                                                labelStyle={{ color: "#a3a3a3" }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="latency_ms"
                                                stroke="#3b82f6"
                                                strokeWidth={2}
                                                dot={false}
                                                animationDuration={300}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Recent Checks</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {uptimeReports.length === 0 && <div className="text-neutral-500 italic">No uptime data available yet...</div>}
                                    {uptimeReports.map((report, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${report.status === 'UP' ? 'bg-green-400' : 'bg-red-400'}`} />
                                                <div>
                                                    <div className="text-sm font-medium text-white">{new Date(report.timestamp * 1000).toLocaleString()}</div>
                                                    <div className="text-xs text-neutral-500">{report.check_type} • {report.target}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-bold text-white">{report.latency_ms}ms</div>
                                                <Badge className={report.status === 'UP' ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>
                                                    {report.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="drift">
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-white">Drift by group</CardTitle>
                                <RefreshButton
                                    loading={driftLoading}
                                    onRefresh={fetchDrift}
                                    aria-label="Refresh drift"
                                    className="border-neutral-700 text-white hover:bg-neutral-800"
                                />
                            </div>
                            <CardDescription className="text-neutral-400">
                                Status of this server compared to each group it belongs to.{" "}
                                <Link href="/drift/compare" className="text-sky-400 hover:underline">Compare groups</Link>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {driftLoading && driftGroups.length === 0 ? (
                                <div className="text-neutral-500 italic py-4">Loading drift…</div>
                            ) : driftGroups.length === 0 ? (
                                <div className="text-neutral-500 italic py-4">Not in any group, or no drift data yet.</div>
                            ) : (
                                <div className="space-y-3">
                                    {driftGroups.map((g) => (
                                        <div key={g.group_id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                            <div>
                                                <div className="font-medium text-white">{g.group_name}</div>
                                                {g.diff_summary && <div className="text-sm text-neutral-400 mt-1">{g.diff_summary}</div>}
                                                {g.error_message && <div className="text-sm text-amber-400 mt-1">{g.error_message}</div>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/groups/${encodeURIComponent(g.group_id)}/logs`}>Group logs</Link>
                                                </Button>
                                                <Badge
                                                className={
                                                    g.status === "in_sync"
                                                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                        : g.status === "drifted"
                                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                        : "bg-red-500/10 text-red-400 border-red-500/20"
                                                }
                                            >
                                                {g.status === "in_sync" ? "In sync" : g.status === "drifted" ? "Drifted" : g.status}
                                            </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="settings">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
                            <p className="text-sm text-neutral-400">
                                Edit labels, config file path, backups, and more in the full agent config page.
                            </p>
                            <Button variant="outline" size="sm" asChild className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                                <Link href={`/agents/${encodeURIComponent(id)}/config`}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    Edit agent config
                                </Link>
                            </Button>
                        </div>
                        {/* Multi-Gateway Configuration */}
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-white flex items-center gap-2">
                                            <Network className="h-5 w-5 text-blue-400" />
                                            Gateway Configuration
                                        </CardTitle>
                                        <CardDescription className="text-neutral-400 mt-1">
                                            Configure gateway addresses for telemetry and command streaming
                                        </CardDescription>
                                    </div>
                                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                        {agentConfig.multi_gateway_mode ? 'Multi-Gateway' : 'Single Gateway'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                    <div className="flex items-center gap-3">
                                        <Globe className="h-5 w-5 text-blue-400" />
                                        <div>
                                            <Label className="text-white">Multi-Gateway Mode</Label>
                                            <p className="text-xs text-neutral-500">Send telemetry to multiple gateways for redundancy</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={agentConfig.multi_gateway_mode}
                                        onCheckedChange={(checked) => setAgentConfig(prev => ({ ...prev, multi_gateway_mode: checked }))}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-white">Gateway Addresses</Label>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={addGatewayAddress}
                                            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Gateway
                                        </Button>
                                    </div>
                                    {agentConfig.gateway_addresses.map((addr, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1 relative">
                                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                                <Input
                                                    value={addr}
                                                    onChange={(e) => updateGatewayAddress(index, e.target.value)}
                                                    placeholder="gateway.example.com:5020"
                                                    className="pl-10 bg-neutral-950 border-neutral-800 text-white"
                                                />
                                            </div>
                                            {agentConfig.gateway_addresses.length > 1 && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => removeGatewayAddress(index)}
                                                    className="text-red-400 hover:bg-red-500/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    <p className="text-xs text-neutral-500 flex items-center gap-1">
                                        <Info className="h-3 w-3" />
                                        {agentConfig.multi_gateway_mode 
                                            ? "Agent will send data to ALL configured gateways simultaneously"
                                            : "Agent will use the first gateway address only"}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* NGINX Configuration */}
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <FileCode className="h-5 w-5 text-green-400" />
                                    NGINX Settings
                                </CardTitle>
                                <CardDescription className="text-neutral-400">
                                    Configure NGINX paths and monitoring endpoints
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Status URL</Label>
                                        <Input
                                            value={agentConfig.nginx_status_url}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, nginx_status_url: e.target.value }))}
                                            placeholder="http://127.0.0.1/nginx_status"
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Config Path</Label>
                                        <Input
                                            value={agentConfig.nginx_config_path}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, nginx_config_path: e.target.value }))}
                                            placeholder="/etc/nginx/nginx.conf"
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Access Log Path</Label>
                                        <Input
                                            value={agentConfig.access_log_path}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, access_log_path: e.target.value }))}
                                            placeholder="/var/log/nginx/access.log"
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Error Log Path</Label>
                                        <Input
                                            value={agentConfig.error_log_path}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, error_log_path: e.target.value }))}
                                            placeholder="/var/log/nginx/error.log"
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-neutral-300">Log Format</Label>
                                    <Select
                                        value={agentConfig.log_format}
                                        onValueChange={(value) => setAgentConfig(prev => ({ ...prev, log_format: value }))}
                                    >
                                        <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white">
                                            <SelectValue placeholder="Select log format" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="combined">Combined (Apache/NGINX Standard)</SelectItem>
                                            <SelectItem value="json">JSON (Structured)</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Telemetry Settings */}
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Zap className="h-5 w-5 text-amber-400" />
                                    Telemetry & Updates
                                </CardTitle>
                                <CardDescription className="text-neutral-400">
                                    Configure metrics collection and automatic updates
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Metrics Interval (seconds)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={agentConfig.metrics_interval_seconds}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, metrics_interval_seconds: parseInt(e.target.value) || 1 }))}
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Heartbeat Interval (seconds)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={agentConfig.heartbeat_interval_seconds}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, heartbeat_interval_seconds: parseInt(e.target.value) || 1 }))}
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Update Server URL</Label>
                                        <Input
                                            value={agentConfig.update_server}
                                            onChange={(e) => setAgentConfig(prev => ({ ...prev, update_server: e.target.value }))}
                                            placeholder="http://update.example.com:8090"
                                            className="bg-neutral-950 border-neutral-800 text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-neutral-300">Log Level</Label>
                                        <Select
                                            value={agentConfig.log_level}
                                            onValueChange={(value) => setAgentConfig(prev => ({ ...prev, log_level: value }))}
                                        >
                                            <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white">
                                                <SelectValue placeholder="Select log level" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="debug">Debug</SelectItem>
                                                <SelectItem value="info">Info</SelectItem>
                                                <SelectItem value="warn">Warning</SelectItem>
                                                <SelectItem value="error">Error</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-neutral-800">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                        <div>
                                            <Label className="text-white text-sm">VTS Metrics</Label>
                                            <p className="text-xs text-neutral-500">Enhanced NGINX metrics</p>
                                        </div>
                                        <Switch
                                            checked={agentConfig.enable_vts_metrics}
                                            onCheckedChange={(checked) => setAgentConfig(prev => ({ ...prev, enable_vts_metrics: checked }))}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                        <div>
                                            <Label className="text-white text-sm">Log Streaming</Label>
                                            <p className="text-xs text-neutral-500">Real-time log forwarding</p>
                                        </div>
                                        <Switch
                                            checked={agentConfig.enable_log_streaming}
                                            onCheckedChange={(checked) => setAgentConfig(prev => ({ ...prev, enable_log_streaming: checked }))}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                                        <div>
                                            <Label className="text-white text-sm">Auto-Apply Config</Label>
                                            <p className="text-xs text-neutral-500">Apply changes automatically</p>
                                        </div>
                                        <Switch
                                            checked={agentConfig.auto_apply_config}
                                            onCheckedChange={(checked) => setAgentConfig(prev => ({ ...prev, auto_apply_config: checked }))}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Config backups (last 5) */}
                        <Card className="bg-neutral-900 border-neutral-800" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                                    <FileText className="h-5 w-5 text-amber-400" />
                                    Config backups
                                </CardTitle>
                                <CardDescription className="text-neutral-400" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    Last 5 backups of avika-agent.conf. Restore overwrites current config; agent restart may be required.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mb-3">
                                    <RefreshButton
                                        loading={configBackupsLoading}
                                        onRefresh={fetchConfigBackups}
                                        label="Refresh list"
                                        aria-label="Refresh config backups list"
                                        className="border-neutral-700 text-white hover:bg-neutral-800"
                                    />
                                </div>
                                {configBackups.length === 0 && !configBackupsLoading && (
                                    <p className="text-sm text-neutral-500" style={{ color: "rgb(var(--theme-text-muted))" }}>No backups yet. Save configuration to create one.</p>
                                )}
                                <ul className="space-y-2">
                                    {configBackups.map((b) => (
                                        <li key={b.name} className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                                            <span className="font-mono text-sm text-white truncate" style={{ color: "rgb(var(--theme-text))" }}>{b.name}</span>
                                            <span className="text-xs text-neutral-500 shrink-0 ml-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {b.created_at ? new Date(b.created_at * 1000).toLocaleString() : "—"}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="ml-2 border-amber-700 text-amber-400 hover:bg-amber-900/20"
                                                disabled={restoreLoading}
                                                onClick={() => restoreConfigBackup(b.name)}
                                            >
                                                Restore
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Save Button */}
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={fetchAgentConfig}
                                className="border-neutral-700 text-white hover:bg-neutral-800"
                                disabled={configLoading}
                            >
                                <RotateCcw className={`h-4 w-4 mr-2 ${configLoading ? 'animate-spin' : ''}`} />
                                Reset
                            </Button>
                            <Button
                                onClick={saveAgentConfig}
                                disabled={isSavingConfig}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isSavingConfig ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Configuration
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
