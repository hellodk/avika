"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, FileCode } from "lucide-react";

const ENV_VARS = [
    "SAML_ENABLED",
    "SAML_IDP_METADATA_URL",
    "SAML_ENTITY_ID",
    "SAML_ROOT_URL",
    "SAML_CERT_FILE",
    "SAML_KEY_FILE",
    "SAML_GROUPS_CLAIM",
    "SAML_DEFAULT_ROLE",
    "SAML_AUTO_PROVISION",
    "SAML_GROUP_MAPPING",
];

export default function SAMLSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3" style={{ color: "rgb(var(--theme-text))" }}>
                    <ShieldCheck className="h-8 w-8 text-blue-500" />
                    SAML 2.0
                </h1>
                <p className="mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Enterprise SAML 2.0 single sign-on. Configure via gateway environment variables or config file.
                </p>
            </div>

            <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <CardHeader>
                    <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Configuration</CardTitle>
                    <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                        SAML is configured on the gateway (Avika). Set the following environment variables or equivalent YAML in the gateway config.
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
                        The gateway exposes <code className="rounded px-1" style={{ background: "rgb(var(--theme-background))" }}>/saml/login</code>, <code className="rounded px-1" style={{ background: "rgb(var(--theme-background))" }}>/saml/metadata</code>, and ACS endpoints.
                        When <code className="rounded px-1" style={{ background: "rgb(var(--theme-background))" }}>SAML_ENABLED=true</code>, users can sign in via your IdP. Check <strong>SSO Integration</strong> for status.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
