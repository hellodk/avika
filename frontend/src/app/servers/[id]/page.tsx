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
import { FileCode, Save, RotateCcw, CheckCircle2, AlertTriangle, Shield, FileText, RefreshCw, Play, Square, RotateCcwIcon, Construction, Plus, Trash2, BarChart3, Activity, Terminal, Copy, Check, Settings, Server, Network, Zap, Globe, Info } from "lucide-react";
import { useState, useEffect, use } from "react";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { TerminalOverlay } from "@/components/TerminalOverlay";
import { apiFetch } from "@/lib/api";

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    status: number;
    request_method?: string;
    request_uri?: string;
    formattedTime?: string;
}

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [serverInfo, setServerInfo] = useState<any>(null);
    const [config, setConfig] = useState("");
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(false);

    const [logs, setLogs] = useState<LogEntry[]>([]);
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

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${id}`);
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
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAnalytics = async () => {
        try {
            const res = await apiFetch(`/api/analytics?agent_id=${id}&window=24h`);
            const data = await res.json();
            setAnalytics(data);
        } catch (err) {
            console.error("Failed to fetch analytics", err);
        }
    };

    const fetchAgentConfig = async () => {
        setConfigLoading(true);
        try {
            const res = await apiFetch(`/api/servers/${id}/config`);
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

    const saveAgentConfig = async () => {
        setIsSavingConfig(true);
        try {
            const configToSave = {
                ...agentConfig,
                gateway_addresses: agentConfig.gateway_addresses.filter(addr => addr.trim() !== ''),
            };
            
            const res = await apiFetch(`/api/servers/${id}/config`, {
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
            const res = await apiFetch(`/api/servers/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });
            const result = await res.json();
            if (result.success) {
                console.log(`NGINX ${action} success`);
                // Optional: show toast
            } else {
                console.error(`NGINX ${action} failed:`, result.error);
            }
        } catch (err) {
            console.error(`Failed to trigger ${action}`, err);
        }
    };

    const handleSaveConfig = async () => {
        try {
            const res = await apiFetch(`/api/servers/${id}`, {
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

        // Connect to Log Stream
        const eventSource = new EventSource(`/api/servers/${id}/logs`);

        eventSource.onopen = () => {
            setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const newLog = JSON.parse(event.data);
                const ts = newLog.timestamp || Math.floor(Date.now() / 1000);
                const date = new Date(ts * 1000);
                newLog.formattedTime = date.toLocaleString();

                // Construct a message string if it doesn't exist
                if (!newLog.message && newLog.content) {
                    newLog.message = newLog.content;
                } else if (!newLog.message) {
                    newLog.message = `${newLog.request_method} ${newLog.request_uri} ${newLog.status}`;
                }

                setLogs((prev) => [newLog, ...prev].slice(0, 50));
            } catch (e) {
                console.error("Failed to parse log", e);
            }
        };

        eventSource.onerror = (err) => {
            console.error("SSE Error:", err);
            setIsConnected(false);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [id]);

    useEffect(() => {
        const fetchUptime = async () => {
            try {
                const res = await apiFetch(`/api/servers/${id}/uptime`);
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

    if (isLoading && !serverInfo) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const currentStatus = serverInfo?.status || "unknown";
    const execCommand = `kubectl exec -it ${serverInfo?.hostname} -- /bin/bash`;

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
                            className="absolute right-1 top-1 h-8 w-8 text-neutral-500 hover:text-white"
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

            <Tabs defaultValue="config" className="space-y-4">
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
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <CardTitle className="text-white">Access Logs (Live)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 font-mono text-xs">
                                {logs.length === 0 && isConnected && <div className="text-neutral-500 italic">Waiting for logs...</div>}
                                {!isConnected && logs.length === 0 && <div className="text-neutral-500 italic">Connecting to log stream...</div>}
                                {logs.map((log, idx) => (
                                    <div key={idx} className={`p-2 rounded ${log.status >= 400 ? 'bg-red-500/10 text-red-400' : 'bg-neutral-950 text-neutral-300'}`}>
                                        <span className="text-neutral-500">[{log.formattedTime || log.timestamp}]</span> {log.message}
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

                <TabsContent value="settings">
                    <div className="space-y-6">
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
                                        <SelectContent className="bg-neutral-900 border-neutral-800">
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
                                            <SelectContent className="bg-neutral-900 border-neutral-800">
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
