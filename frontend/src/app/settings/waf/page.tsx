"use client";

import { useEffect, useState } from "react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { Shield, Plus, Lock, Settings, FileCode, CheckCircle2, XCircle } from "lucide-react";

interface WAFPolicy {
    id: string;
    name: string;
    description: string;
    rules: string;
    enabled: boolean;
    created_at: string;
}

export default function WAFSettingsPage() {
    const [policies, setPolicies] = useState<WAFPolicy[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPolicies = async () => {
            try {
                const res = await apiFetch("/api/waf/policies");
                if (res.ok) {
                    const data = await res.json();
                    setPolicies(data || []);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchPolicies();
    }, []);

    if (loading) return <div className="flex items-center justify-center h-64" style={{ color: "rgb(var(--theme-text))" }}>Loading WAF policies...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" style={{ color: "rgb(var(--theme-text))" }}>
                        <Lock className="h-8 w-8 text-purple-500" />
                        WAF Policy Management
                    </h1>
                    <p className="mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Manage Security Engine rule sets and distribution across your NGINX fleet.
                    </p>
                </div>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Create Policy
                </Button>
            </div>

            <Card className="shadow-xl overflow-hidden" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader className="border-b py-4 bg-gradient-to-r from-purple-500/10 to-transparent" style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                        <Shield className="h-4 w-4 text-purple-400" />
                        Active Security Policies
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent" style={{ borderColor: "rgb(var(--theme-border))" }}>
                                <TableHead className="w-[250px]">Policy Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Rules</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {policies.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12">
                                        <div className="flex flex-col items-center gap-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            <Shield className="h-12 w-12 opacity-20" />
                                            <p>No WAF policies defined yet.</p>
                                            <Button variant="outline" size="sm" className="mt-2">Deploy OWASP Core Rule Set</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                policies.map((policy) => (
                                    <TableRow key={policy.id} className="hover:bg-white/5 transition-colors" style={{ borderColor: "rgb(var(--theme-border))" }}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold" style={{ color: "rgb(var(--theme-text))" }}>{policy.name}</span>
                                                <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>{policy.description}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {policy.enabled ? (
                                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Active
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
                                                    <XCircle className="h-3 w-3" />
                                                    Disabled
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                <FileCode className="h-3 w-3" />
                                                {policy.rules.length} bytes
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            {new Date(policy.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" className="hover:bg-purple-500/10 text-purple-400">
                                                    <Settings className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="hover:bg-blue-500/10 text-blue-400">
                                                    Deploy
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-lg" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <CardHeader>
                        <CardTitle className="text-lg" style={{ color: "rgb(var(--theme-text))" }}>Security Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-4">
                            <InfoIcon className="h-6 w-6 text-blue-400 shrink-0" />
                            <div>
                                <h4 className="font-medium text-blue-400">OWASP Integration</h4>
                                <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>Avika can automatically pull and update the OWASP Core Rule Set (CRS) for enterprise-grade protection.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}
