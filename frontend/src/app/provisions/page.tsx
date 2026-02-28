"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Zap, Shield, HeartPulse, FileCode, Check, AlertCircle,
    ArrowRight, ArrowLeft, Save, Play, Trash2, Server
} from "lucide-react";
import { generateProvisionSnippet } from "@/lib/provisions";

interface ProvisionTemplate {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

const templates: ProvisionTemplate[] = [
    {
        id: "rate-limiting",
        title: "Rate Limiting",
        description: "Protect your backends from abuse by limiting request rates per IP.",
        icon: Shield,
        color: "text-blue-500 bg-blue-500/10"
    },
    {
        id: "health-checks",
        title: "Health Checks",
        description: "Configure active/passive health checks for your upstream servers.",
        icon: HeartPulse,
        color: "text-red-500 bg-red-500/10"
    },
    {
        id: "location-blocks",
        title: "Location Blocks",
        description: "Guided creation of proxy_pass, caching, and header rules.",
        icon: FileCode,
        color: "text-purple-500 bg-purple-500/10"
    },
    {
        id: "error-pages",
        title: "Custom Error Pages",
        description: "Map standard HTTP error codes to branded HTML pages.",
        icon: AlertCircle,
        color: "text-amber-500 bg-amber-500/10"
    },
    {
        id: "custom",
        title: "Custom Provision",
        description: "Define custom blocks manually.",
        icon: Zap,
        color: "text-gray-500 bg-gray-500/10"
    }
];

export default function ProvisionsPage() {
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [selectedAgent, setSelectedAgent] = useState<string>("");
    const [agents, setAgents] = useState<any[]>([]);
    const [config, setConfig] = useState<any>({});

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await apiFetch('/api/servers');
                if (res.ok) {
                    const data = await res.json();
                    setAgents(data);
                }
            } catch (err) {
                console.error("Failed to fetch agents:", err);
            }
        };
        fetchAgents();
    }, []);

    const reset = () => {
        setSelectedTemplate(null);
        setStep(1);
        setSelectedAgent("");
        setConfig({});
    };

    if (!selectedTemplate) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: `rgb(var(--theme-text))` }}>HTTP Provisions</h1>
                    <p className="text-sm" style={{ color: `rgb(var(--theme-text-muted))` }}>Guided configuration templates for common NGINX patterns</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {templates.map((tpl) => (
                        <Card
                            key={tpl.id}
                            className="group hover:border-primary transition-all cursor-pointer"
                            style={{ background: `rgb(var(--theme-surface))`, borderColor: `rgb(var(--theme-border))` }}
                            onClick={() => setSelectedTemplate(tpl.id)}
                        >
                            <CardHeader>
                                <div className={`h-12 w-12 rounded-lg flex items-center justify-center mb-4 ${tpl.color}`}>
                                    <tpl.icon className="h-6 w-6" />
                                </div>
                                <CardTitle className="text-lg" style={{ color: `rgb(var(--theme-text))` }}>{tpl.title}</CardTitle>
                                <CardDescription style={{ color: `rgb(var(--theme-text-muted))` }}>{tpl.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <button className="text-sm font-medium text-primary flex items-center gap-2 group-hover:gap-3 transition-all">
                                    Start Provisioning <ArrowRight className="h-4 w-4" />
                                </button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card className="border-dashed" style={{ background: `transparent`, borderColor: `rgb(var(--theme-border))` }}>
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <Zap className="h-10 w-10 text-primary mb-4" />
                        <h3 className="text-lg font-semibold" style={{ color: `rgb(var(--theme-text))` }}>Empty Base Template</h3>
                        <p className="text-sm max-w-sm mb-6" style={{ color: `rgb(var(--theme-text-muted))` }}>
                            Starting from scratch? Use the base template to define custom blocks manually.
                        </p>
                        <Button variant="outline" style={{ borderColor: `rgb(var(--theme-primary))`, color: `rgb(var(--theme-primary))` }} onClick={() => setSelectedTemplate('custom')}>
                            Create Custom Provision
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Wizard Logic
    const currentTemplate = templates.find(t => t.id === selectedTemplate);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={reset}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-xl font-bold" style={{ color: `rgb(var(--theme-text))` }}>
                        Provisioning: {currentTemplate?.title}
                    </h2>
                    <div className="flex gap-2 mt-1">
                        {[1, 2, 3].map((s) => (
                            <div
                                key={s}
                                className={`h-1 w-12 rounded-full ${s <= step ? 'bg-primary' : 'bg-neutral-800'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <Card style={{ background: `rgb(var(--theme-surface))`, borderColor: `rgb(var(--theme-border))` }}>
                <CardContent className="p-8">
                    {step === 1 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium" style={{ color: `rgb(var(--theme-text))` }}>Step 1: Select Target Instance</h3>
                            <div className="grid grid-cols-1 gap-4">
                                {agents.map(agent => (
                                    <div
                                        key={agent.agent_id}
                                        onClick={() => setSelectedAgent(agent.agent_id)}
                                        className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center justify-between ${selectedAgent === agent.agent_id ? 'border-primary bg-primary/5' : 'border-neutral-800 hover:border-neutral-600'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Server className="h-5 w-5 text-neutral-400" />
                                            <div>
                                                <p className="font-medium" style={{ color: `rgb(var(--theme-text))` }}>{agent.hostname}</p>
                                                <p className="text-xs text-neutral-500">{agent.ip} | ID: {agent.agent_id}</p>
                                            </div>
                                        </div>
                                        {selectedAgent === agent.agent_id && <Check className="h-5 w-5 text-primary" />}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <Button disabled={!selectedAgent} onClick={() => setStep(2)}>
                                    Next <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium" style={{ color: `rgb(var(--theme-text))` }}>Step 2: Configuration Details</h3>

                            <div className="space-y-4">
                                {selectedTemplate === 'rate-limiting' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Requests Per Minute</label>
                                            <input
                                                type="number"
                                                value={config.requests_per_minute || 60}
                                                onChange={e => setConfig({ ...config, requests_per_minute: parseFloat(e.target.value) })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Burst Size</label>
                                            <input
                                                type="number"
                                                value={config.burst_size || 20}
                                                onChange={e => setConfig({ ...config, burst_size: parseFloat(e.target.value) })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {selectedTemplate === 'health-checks' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Upstream Name</label>
                                            <input
                                                type="text"
                                                value={config.upstream_name || "backend"}
                                                onChange={e => setConfig({ ...config, upstream_name: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Servers (one per line)</label>
                                            <textarea
                                                rows={3}
                                                value={config.servers || ""}
                                                onChange={e => setConfig({ ...config, servers: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                                placeholder="server 10.0.0.1:8080;"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div>
                                                <label className="text-xs font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Interval (ms)</label>
                                                <input type="number" value={config.interval || 3000} onChange={e => setConfig({ ...config, interval: parseFloat(e.target.value) })} className="w-full bg-transparent border rounded-md p-2 text-sm" style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Timeout (ms)</label>
                                                <input type="number" value={config.timeout || 1000} onChange={e => setConfig({ ...config, timeout: parseFloat(e.target.value) })} className="w-full bg-transparent border rounded-md p-2 text-sm" style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Rise</label>
                                                <input type="number" value={config.rise || 2} onChange={e => setConfig({ ...config, rise: parseFloat(e.target.value) })} className="w-full bg-transparent border rounded-md p-2 text-sm" style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Fall</label>
                                                <input type="number" value={config.fall || 3} onChange={e => setConfig({ ...config, fall: parseFloat(e.target.value) })} className="w-full bg-transparent border rounded-md p-2 text-sm" style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedTemplate === 'location-blocks' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Path</label>
                                            <input
                                                type="text"
                                                value={config.path || "/"}
                                                onChange={e => setConfig({ ...config, path: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Directives</label>
                                            <textarea
                                                rows={5}
                                                value={config.directives || ""}
                                                onChange={e => setConfig({ ...config, directives: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2 font-mono text-sm"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                                placeholder={`proxy_pass http://backend;\nproxy_set_header Host $host;`}
                                            />
                                        </div>
                                    </div>
                                )}

                                {selectedTemplate === 'error-pages' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Error Codes</label>
                                            <input
                                                type="text"
                                                value={config.error_codes || "404 500 502"}
                                                onChange={e => setConfig({ ...config, error_codes: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                                placeholder="404 500 502"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Page Path (URL or local file)</label>
                                            <input
                                                type="text"
                                                value={config.page_path || "/error.html"}
                                                onChange={e => setConfig({ ...config, page_path: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {selectedTemplate === 'custom' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block" style={{ color: `rgb(var(--theme-text))` }}>Raw NGINX Configuration</label>
                                            <textarea
                                                rows={10}
                                                value={config.raw_config || ""}
                                                onChange={e => setConfig({ ...config, raw_config: e.target.value })}
                                                className="w-full bg-transparent border rounded-md p-2 font-mono text-xs"
                                                style={{ borderColor: `rgb(var(--theme-border))`, color: `rgb(var(--theme-text))` }}
                                                placeholder={`server {\n    listen 80;\n    server_name example.com;\n}`}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                                <Button onClick={() => setStep(3)}>
                                    Preview & Apply <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium" style={{ color: `rgb(var(--theme-text))` }}>Step 3: Preview Configuration</h3>
                            <div className="bg-neutral-950 p-4 rounded-lg font-mono text-xs overflow-x-auto" style={{ color: '#10b981' }}>
                                <pre>{generateProvisionSnippet(selectedTemplate || '', config)}</pre>
                            </div>
                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={async () => {
                                    try {
                                        const res = await apiFetch('/api/provisions', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                instance_id: selectedAgent,
                                                template: selectedTemplate,
                                                config: config
                                            })
                                        });

                                        if (res.ok) {
                                            const data = await res.json();
                                            alert(`Provision applied successfully!\n\nPreview:\n${data.preview}`);
                                            reset();
                                        } else {
                                            alert('Failed to apply provision');
                                        }
                                    } catch (err) {
                                        alert('Error: ' + err);
                                    }
                                }}>
                                    Confirm & Apply <Play className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
