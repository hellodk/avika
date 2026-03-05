"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";

interface SSOConfig {
    oidc_enabled?: boolean;
    ldap_enabled?: boolean;
    saml_enabled?: boolean;
}

export default function SSOSettingsPage() {
    const [config, setConfig] = useState<SSOConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await apiFetch("/api/auth/sso-config");
                const data = await res.json();
                setConfig(data);
            } catch {
                setConfig({ oidc_enabled: false, ldap_enabled: false, saml_enabled: false });
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64" style={{ color: "rgb(var(--theme-text))" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const providers = [
        { key: "oidc" as const, label: "OpenID Connect (OIDC)", href: "/settings", enabled: config?.oidc_enabled ?? false },
        { key: "ldap" as const, label: "LDAP", href: "/settings/ldap", enabled: config?.ldap_enabled ?? false },
        { key: "saml" as const, label: "SAML 2.0", href: "/settings/saml", enabled: config?.saml_enabled ?? false },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3" style={{ color: "rgb(var(--theme-text))" }}>
                    <KeyRound className="h-8 w-8 text-blue-500" />
                    SSO Integration
                </h1>
                <p className="mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Single sign-on and enterprise authentication status. Configure each provider via environment variables or gateway config.
                </p>
            </div>

            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader>
                    <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Authentication providers</CardTitle>
                    <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                        Status is read from the gateway. Enable OIDC, LDAP, or SAML in the gateway configuration.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {providers.map((p) => (
                        <div
                            key={p.key}
                            className="flex items-center justify-between py-3 px-4 rounded-lg border"
                            style={{ borderColor: "rgb(var(--theme-border))", background: "rgb(var(--theme-background))" }}
                        >
                            <div className="flex items-center gap-3">
                                {p.enabled ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden />
                                ) : (
                                    <XCircle className="h-5 w-5 text-slate-500" aria-hidden />
                                )}
                                <span className="font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                    {p.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge
                                    variant="outline"
                                    className={p.enabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}
                                >
                                    {p.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                                <Link
                                    href={p.href}
                                    className="text-sm font-medium hover:underline"
                                    style={{ color: "rgb(var(--theme-primary))" }}
                                >
                                    {p.key === "oidc" ? "See General / Login" : "Configure"}
                                </Link>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
