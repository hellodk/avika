"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, FileCode } from "lucide-react";

const ENV_VARS = [
    "LDAP_ENABLED",
    "LDAP_URL",
    "LDAP_BIND_DN",
    "LDAP_BIND_PASSWORD",
    "LDAP_BASE_DN",
    "LDAP_USER_FILTER",
    "LDAP_GROUP_FILTER",
    "LDAP_DEFAULT_ROLE",
    "LDAP_AUTO_PROVISION",
    "LDAP_GROUP_MAPPING",
];

export default function LDAPSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3" style={{ color: "rgb(var(--theme-text))" }}>
                    <Key className="h-8 w-8 text-blue-500" />
                    LDAP
                </h1>
                <p className="mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Enterprise LDAP and Active Directory authentication. Configure via gateway environment variables or config file.
                </p>
            </div>

            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader>
                    <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Configuration</CardTitle>
                    <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                        LDAP is configured on the gateway. Set the following environment variables or equivalent YAML in the gateway config.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2 font-mono text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {ENV_VARS.map((v) => (
                            <li key={v} className="flex items-center gap-2">
                                <FileCode className="h-4 w-4 shrink-0" />
                                <code className="rounded px-1.5 py-0.5" style={{ background: "rgb(var(--theme-background))" }}>{v}</code>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        After configuration, the login page will show an LDAP sign-in option when LDAP_ENABLED is true.
                        Check gateway logs and SSO Integration for status.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
