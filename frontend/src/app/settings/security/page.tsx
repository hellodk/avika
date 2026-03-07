"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, KeyRound, Key, ShieldCheck, Lock, Zap } from "lucide-react";

const securitySections = [
    {
        href: "/settings/sso",
        icon: <KeyRound className="h-5 w-5 text-blue-500" />,
        title: "SSO Integration",
        description: "Configure OpenID Connect, view authentication provider status, and manage single sign-on.",
    },
    {
        href: "/settings/ldap",
        icon: <Key className="h-5 w-5 text-emerald-500" />,
        title: "LDAP",
        description: "Configure LDAP directory integration for user authentication and group sync.",
    },
    {
        href: "/settings/saml",
        icon: <ShieldCheck className="h-5 w-5 text-purple-500" />,
        title: "SAML 2.0",
        description: "Set up SAML-based single sign-on with your identity provider.",
    },
    {
        href: "/settings/waf",
        icon: <Lock className="h-5 w-5 text-amber-500" />,
        title: "WAF Policies",
        description: "Manage Web Application Firewall rule sets and distribution across your NGINX fleet.",
    },
    {
        href: "/settings/llm",
        icon: <Zap className="h-5 w-5 text-cyan-500" />,
        title: "LLM / AI Providers",
        description: "Configure AI providers (OpenAI, Anthropic, Ollama) for error analysis and recommendations.",
    },
];

export default function SecuritySettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1
                    className="text-2xl font-bold tracking-tight flex items-center gap-3"
                    style={{ color: "rgb(var(--theme-text))" }}
                >
                    <Lock className="h-7 w-7 text-blue-500" />
                    Security &amp; AI Settings
                </h1>
                <p className="mt-1 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Authentication providers, firewall policies, and AI configuration.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {securitySections.map((section) => (
                    <Link key={section.href} href={section.href}>
                        <Card
                            className="hover:border-blue-500/50 transition-colors cursor-pointer h-full"
                            style={{
                                background: "rgb(var(--theme-surface))",
                                borderColor: "rgb(var(--theme-border))",
                            }}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle
                                    className="text-sm font-medium flex items-center gap-2"
                                    style={{ color: "rgb(var(--theme-text))" }}
                                >
                                    {section.icon}
                                    {section.title}
                                </CardTitle>
                                <ChevronRight
                                    className="h-4 w-4"
                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                />
                            </CardHeader>
                            <CardContent>
                                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    {section.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
