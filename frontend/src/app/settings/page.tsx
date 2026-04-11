"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Save, Check, Loader2, Settings, Globe, Lock, Zap, ChevronRight, RefreshCw, PlugZap, Key, KeyRound, ShieldCheck, Users, FolderKanban } from "lucide-react";
import { useUserSettings } from "@/lib/user-settings";
import { toast } from "sonner";
// Link removed — security sub-pages now render inline
import nextDynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

// Lazy-loaded security sub-pages for inline rendering
const SSOPage = nextDynamic(() => import("./sso/page"), { loading: () => <PageSkeleton /> });
const LDAPPage = nextDynamic(() => import("./ldap/page"), { loading: () => <PageSkeleton /> });
const SAMLPage = nextDynamic(() => import("./saml/page"), { loading: () => <PageSkeleton /> });
const WAFPage = nextDynamic(() => import("./waf/page"), { loading: () => <PageSkeleton /> });
const LLMPage = nextDynamic(() => import("./llm/page"), { loading: () => <PageSkeleton /> });
const ProjectsPage = nextDynamic(() => import("./projects/page"), { loading: () => <PageSkeleton /> });
const UsersPage = nextDynamic(() => import("./users/page"), { loading: () => <PageSkeleton /> });
const TeamsPage = nextDynamic(() => import("./teams/page"), { loading: () => <PageSkeleton /> });

function PageSkeleton() {
    return <div className="space-y-4 py-4">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />)}</div>;
}

const securityPageMap: Record<string, React.ComponentType> = {
    "/settings/sso": SSOPage,
    "/settings/ldap": LDAPPage,
    "/settings/saml": SAMLPage,
    "/settings/waf": WAFPage,
    "/settings/llm": LLMPage,
};

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { IntegrationSettings } from "@/components/settings/integration-settings";
import { DisplaySettings } from "@/components/settings/display-settings";
import { TelemetrySettings } from "@/components/settings/telemetry-settings";
// AIEngineSettings removed from General tab — accessible via Security → LLM
import { AgentManagement } from "@/components/settings/agent-management";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useProject } from "@/lib/project-context";

// ── Integration card (from /settings/integrations) ──────────────────────────

type IntegrationRow = {
    type: string;
    config: Record<string, any>;
    is_enabled: boolean;
    test_result?: Record<string, any>;
    last_tested_at?: string;
};

function IntegrationCard({ title, description, row, onChange, onSave, onTest, saving, testing }: {
    title: string; description: string; row: IntegrationRow;
    onChange: (row: IntegrationRow) => void; onSave: () => void; onTest: () => void;
    saving: boolean; testing: boolean;
}) {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <CardTitle style={{ color: "rgb(var(--theme-text))" }}>{title}</CardTitle>
                <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border" style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <div>
                        <Label className="text-sm" style={{ color: 'rgb(var(--theme-text))' }}>Enabled</Label>
                        <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>Persisted in the gateway database</p>
                    </div>
                    <Switch checked={row.is_enabled} onCheckedChange={(v) => onChange({ ...row, is_enabled: v })} />
                </div>
                {row.type === "grafana" && <UrlField row={row} onChange={onChange} placeholder="https://grafana.example.com" />}
                {row.type === "webhook" && <UrlField row={row} onChange={onChange} placeholder="https://example.com/webhook" />}
                {row.type === "smtp" && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Host</Label>
                            <Input value={row.config.host || ""} onChange={(e) => onChange({ ...row, config: { ...row.config, host: e.target.value } })} style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }} placeholder="smtp.example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Port</Label>
                            <Input type="number" value={row.config.port ?? 25} onChange={(e) => onChange({ ...row, config: { ...row.config, port: Number(e.target.value) } })} style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }} />
                        </div>
                    </div>
                )}
                {(row.type === "slack" || row.type === "teams") && <UrlField row={row} onChange={onChange} placeholder={`https://hooks.${row.type}.com/...`} isSecret />}
                {row.type === "pagerduty" && <SecretField label="Routing Key" field="routing_key" row={row} onChange={onChange} />}
                {row.type === "opsgenie" && <SecretField label="API Key" field="api_key" row={row} onChange={onChange} />}
                <div className="flex items-center gap-2">
                    <Button onClick={onTest} disabled={testing} variant="outline" style={{ borderColor: 'rgb(var(--theme-border))' }}>
                        <PlugZap className="h-4 w-4 mr-2" />{testing ? "Testing..." : "Test"}
                    </Button>
                    <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function UrlField({ row, onChange, placeholder, isSecret }: { row: IntegrationRow; onChange: (r: IntegrationRow) => void; placeholder: string; isSecret?: boolean }) {
    return (
        <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>URL</Label>
            <Input type={isSecret ? "password" : "url"} value={row.config.url || ""} onChange={(e) => onChange({ ...row, config: { ...row.config, url: e.target.value } })} style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }} placeholder={placeholder} />
        </div>
    );
}

function SecretField({ label, field, row, onChange }: { label: string; field: string; row: IntegrationRow; onChange: (r: IntegrationRow) => void }) {
    return (
        <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>{label}</Label>
            <Input type="password" value={row.config[field] || ""} onChange={(e) => onChange({ ...row, config: { ...row.config, [field]: e.target.value } })} style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }} />
        </div>
    );
}

// ── Security section cards ──────────────────────────────────────────────────

const securitySections = [
    { href: "/settings/sso", icon: <KeyRound className="h-5 w-5 text-blue-500" />, title: "SSO Integration", description: "Configure OpenID Connect, manage single sign-on." },
    { href: "/settings/ldap", icon: <Key className="h-5 w-5 text-emerald-500" />, title: "LDAP", description: "LDAP directory integration for user authentication and group sync." },
    { href: "/settings/saml", icon: <ShieldCheck className="h-5 w-5 text-purple-500" />, title: "SAML 2.0", description: "SAML-based single sign-on with your identity provider." },
    { href: "/settings/waf", icon: <Lock className="h-5 w-5 text-amber-500" />, title: "WAF Policies", description: "Web Application Firewall rule sets and fleet distribution." },
    { href: "/settings/llm", icon: <Zap className="h-5 w-5 text-cyan-500" />, title: "LLM / AI Providers", description: "AI providers (OpenAI, Anthropic, Ollama) for error analysis." },
];

// ── Main settings page ──────────────────────────────────────────────────────

function SettingsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { settings: userSettings, updateSettings, resetSettings } = useUserSettings();
    const { isSuperAdmin, isLoading: projectLoading } = useProject();
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Tab state from URL. Admin-only tabs (users, teams) are hidden for
    // non-superadmins; if someone deep-links to ?tab=users without rights,
    // we redirect them to the general tab once auth state has loaded.
    const requestedTab = searchParams.get("tab") || "general";
    const adminOnlyTabs = useMemo(() => new Set(["users", "teams"]), []);
    const isAdminOnlyTab = adminOnlyTabs.has(requestedTab);

    useEffect(() => {
        if (!projectLoading && isAdminOnlyTab && !isSuperAdmin) {
            router.replace("/settings?tab=general");
        }
    }, [projectLoading, isAdminOnlyTab, isSuperAdmin, router]);

    const tab = isAdminOnlyTab && !isSuperAdmin && !projectLoading ? "general" : requestedTab;

    // ── General tab state ────────────────────────────────────────────────
    const [grafanaUrl, setGrafanaUrl] = useState(userSettings.integrations.grafanaUrl);
    const [clickhouseUrl, setClickhouseUrl] = useState(userSettings.integrations.clickhouseUrl);
    const [prometheusUrl, setPrometheusUrl] = useState(userSettings.integrations.prometheusUrl);
    const [postgresUrl, setPostgresUrl] = useState(userSettings.integrations.postgresUrl ?? "");
    const [defaultTimeRange, setDefaultTimeRange] = useState(userSettings.display.defaultTimeRange);
    const [refreshInterval, setRefreshInterval] = useState(userSettings.display.refreshInterval);
    const [timezone, setTimezone] = useState(userSettings.display.timezone);
    const [collectionInterval, setCollectionInterval] = useState(userSettings.telemetry?.collectionInterval || "10");
    const [retentionDays, setRetentionDays] = useState(userSettings.telemetry?.retentionDays || "30");
    const [anomalyThreshold, setAnomalyThreshold] = useState(userSettings.aiEngine?.anomalyThreshold || "0.8");
    const [windowSize, setWindowSize] = useState(userSettings.aiEngine?.windowSize || "200");

    useEffect(() => {
        setGrafanaUrl(userSettings.integrations.grafanaUrl);
        setClickhouseUrl(userSettings.integrations.clickhouseUrl);
        setPrometheusUrl(userSettings.integrations.prometheusUrl);
        setPostgresUrl(userSettings.integrations.postgresUrl ?? "");
        setDefaultTimeRange(userSettings.display.defaultTimeRange);
        setRefreshInterval(userSettings.display.refreshInterval);
        setTimezone(userSettings.display.timezone);
        setCollectionInterval(userSettings.telemetry?.collectionInterval || "10");
        setRetentionDays(userSettings.telemetry?.retentionDays || "30");
        setAnomalyThreshold(userSettings.aiEngine?.anomalyThreshold || "0.8");
        setWindowSize(userSettings.aiEngine?.windowSize || "200");
    }, [userSettings]);

    useEffect(() => {
        let cancelled = false;
        apiFetch("/api/settings").then((res) => {
            if (cancelled || !res.ok) return;
            return res.json();
        }).then((data: any) => {
            if (cancelled || !data?.integrations) return;
            const i = data.integrations;
            updateSettings({ integrations: { grafanaUrl: i.grafana_url ?? userSettings.integrations.grafanaUrl, prometheusUrl: i.prometheus_url ?? userSettings.integrations.prometheusUrl, clickhouseUrl: i.clickhouse_url ?? userSettings.integrations.clickhouseUrl, postgresUrl: i.postgres_url ?? userSettings.integrations.postgresUrl } });
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const integrationsChanged = useMemo(() => grafanaUrl !== userSettings.integrations.grafanaUrl || clickhouseUrl !== userSettings.integrations.clickhouseUrl || prometheusUrl !== userSettings.integrations.prometheusUrl, [clickhouseUrl, grafanaUrl, prometheusUrl, userSettings.integrations]);
    const displayChanged = useMemo(() => defaultTimeRange !== userSettings.display.defaultTimeRange || refreshInterval !== userSettings.display.refreshInterval || timezone !== userSettings.display.timezone, [defaultTimeRange, refreshInterval, timezone, userSettings.display]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            updateSettings({ integrations: { grafanaUrl: grafanaUrl.trim(), clickhouseUrl: clickhouseUrl.trim(), prometheusUrl: prometheusUrl.trim() }, display: { defaultTimeRange, refreshInterval, timezone }, telemetry: { collectionInterval, retentionDays }, aiEngine: { anomalyThreshold, windowSize } });
            try { localStorage.setItem("grafana_url", grafanaUrl.trim()); } catch {}
            await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integrations: { grafana_url: grafanaUrl.trim(), prometheus_url: prometheusUrl.trim(), clickhouse_url: clickhouseUrl.trim() }, collection_interval: parseInt(collectionInterval), retention_days: parseInt(retentionDays), anomaly_threshold: parseFloat(anomalyThreshold), window_size: parseInt(windowSize) }) });
            setSaveSuccess(true);
            toast.success("Settings saved");
        } catch { setSaveSuccess(true); toast.success("Settings saved locally"); } finally { setIsSaving(false); setTimeout(() => setSaveSuccess(false), 3000); }
    };

    const handleResetDefaults = () => {
        resetSettings();
        try { localStorage.removeItem("grafana_url"); } catch {}
        toast.success("Defaults restored");
    };

    // ── Integrations tab state ───────────────────────────────────────────
    const [intRows, setIntRows] = useState<Record<string, IntegrationRow>>({
        grafana: { type: "grafana", config: {}, is_enabled: false },
        webhook: { type: "webhook", config: {}, is_enabled: false },
        smtp: { type: "smtp", config: {}, is_enabled: false },
        slack: { type: "slack", config: {}, is_enabled: false },
        teams: { type: "teams", config: {}, is_enabled: false },
        pagerduty: { type: "pagerduty", config: {}, is_enabled: false },
        opsgenie: { type: "opsgenie", config: {}, is_enabled: false },
    });
    const [intLoading, setIntLoading] = useState(false);
    const [savingType, setSavingType] = useState<string | null>(null);
    const [testingType, setTestingType] = useState<string | null>(null);
    const [securityDrill, setSecurityDrill] = useState<string | null>(null); // href of active sub-page

    const loadIntegrations = useCallback(async () => {
        setIntLoading(true);
        try {
            const res = await apiFetch("/api/integrations");
            const data = await res.json();
            if (!res.ok) return;
            const list: IntegrationRow[] = Array.isArray(data) ? data : Array.isArray(data?.integrations) ? data.integrations : [];
            const next = { ...intRows };
            for (const row of list) next[row.type] = row;
            setIntRows(next);
        } catch {} finally { setIntLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (tab === "integrations") loadIntegrations(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveInt = async (type: string) => {
        setSavingType(type);
        try {
            const res = await apiFetch(`/api/integrations/${type}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intRows[type]) });
            if (!res.ok) throw new Error("Failed to save");
            toast.success("Integration saved");
            await loadIntegrations();
        } catch (e: any) { toast.error("Failed to save", { description: e?.message }); } finally { setSavingType(null); }
    };

    const testInt = async (type: string) => {
        setTestingType(type);
        try {
            const res = await apiFetch(`/api/integrations/${type}/test`, { method: "POST" });
            const data = await res.json();
            if (!res.ok || data?.success === false) throw new Error(data?.error || "Test failed");
            toast.success("Test OK", { description: data?.message || type });
        } catch (e: any) { toast.error("Test failed", { description: e?.message }); } finally { setTestingType(null); }
    };

    const integrationCards: { key: string; title: string; desc: string }[] = [
        { key: "grafana", title: "Grafana", desc: "Embedded dashboards and links." },
        { key: "webhook", title: "Webhook", desc: "Generic outbound webhook." },
        { key: "smtp", title: "SMTP", desc: "Email connectivity." },
        { key: "slack", title: "Slack", desc: "Channel notifications." },
        { key: "teams", title: "Microsoft Teams", desc: "Channel notifications." },
        { key: "pagerduty", title: "PagerDuty", desc: "Incident triggering." },
        { key: "opsgenie", title: "OpsGenie", desc: "Alert triggering." },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--theme-text))' }}>Settings</h1>
                <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Configure your NGINX AI Manager</p>
            </div>

            <Tabs value={tab} onValueChange={(v) => router.push(`/settings?tab=${v}`)} className="space-y-6">
                <TabsList style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <TabsTrigger value="general" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Settings className="h-4 w-4 mr-2" />General
                    </TabsTrigger>
                    <TabsTrigger value="integrations" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Globe className="h-4 w-4 mr-2" />Integrations
                    </TabsTrigger>
                    <TabsTrigger value="security" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <Lock className="h-4 w-4 mr-2" />Security
                    </TabsTrigger>
                    <TabsTrigger value="projects" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                        <FolderKanban className="h-4 w-4 mr-2" />Projects
                    </TabsTrigger>
                    {/* Users + Teams: admin/superuser only. Hidden until auth state has
                        loaded to prevent flicker for actual admins. */}
                    {!projectLoading && isSuperAdmin && (
                        <>
                            <TabsTrigger value="users" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                                <Users className="h-4 w-4 mr-2" />Users
                            </TabsTrigger>
                            <TabsTrigger value="teams" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                                <ShieldCheck className="h-4 w-4 mr-2" />Teams
                            </TabsTrigger>
                        </>
                    )}
                </TabsList>

                {/* ── General Tab ──────────────────────────────────────────── */}
                <TabsContent value="general" className="space-y-6">
                    <AppearanceSettings />
                    <DisplaySettings defaultTimeRange={defaultTimeRange} setDefaultTimeRange={setDefaultTimeRange} refreshInterval={refreshInterval} setRefreshInterval={setRefreshInterval} timezone={timezone} setTimezone={setTimezone} displayChanged={displayChanged} />
                    <div className="grid gap-6 md:grid-cols-2">
                        <TelemetrySettings collectionInterval={collectionInterval} setCollectionInterval={setCollectionInterval} retentionDays={retentionDays} setRetentionDays={setRetentionDays} />
                        <AgentManagement />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                        <Button variant="outline" onClick={handleResetDefaults} className="min-w-[140px]" style={{ backgroundColor: 'rgb(var(--theme-surface))', color: 'rgb(var(--theme-text))', borderColor: 'rgb(var(--theme-border))' }}>Reset Defaults</Button>
                        <Button onClick={handleSave} disabled={isSaving} className={`min-w-[140px] transition-all ${saveSuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : saveSuccess ? <><Check className="h-4 w-4 mr-2" />Saved</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
                        </Button>
                    </div>
                </TabsContent>

                {/* ── Integrations Tab ─────────────────────────────────────── */}
                <TabsContent value="integrations" className="space-y-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>Service endpoints and external integrations.</p>
                        <RefreshButton loading={intLoading} onRefresh={loadIntegrations} aria-label="Refresh integrations" />
                    </div>
                    {/* Infrastructure URLs (Grafana, Prometheus, ClickHouse) */}
                    <IntegrationSettings grafanaUrl={grafanaUrl} setGrafanaUrl={setGrafanaUrl} clickhouseUrl={clickhouseUrl} setClickhouseUrl={setClickhouseUrl} prometheusUrl={prometheusUrl} setPrometheusUrl={setPrometheusUrl} postgresUrl={postgresUrl} integrationsChanged={integrationsChanged} />
                    <div className="grid gap-6 lg:grid-cols-2">
                        {integrationCards.map((ic) => (
                            <IntegrationCard key={ic.key} title={ic.title} description={ic.desc} row={intRows[ic.key]} onChange={(r) => setIntRows((p) => ({ ...p, [ic.key]: r }))} onSave={() => saveInt(ic.key)} onTest={() => testInt(ic.key)} saving={savingType === ic.key} testing={testingType === ic.key} />
                        ))}
                    </div>
                </TabsContent>

                {/* ── Security Tab ─────────────────────────────────────────── */}
                <TabsContent value="security" className="space-y-6">
                    <AnimatePresence mode="wait">
                        {securityDrill ? (() => {
                            const Page = securityPageMap[securityDrill];
                            const section = securitySections.find(s => s.href === securityDrill);
                            return (
                                <motion.div key={securityDrill} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }} transition={{ duration: 0.2 }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <button onClick={() => setSecurityDrill(null)} className="text-sm hover:underline" style={{ color: "rgb(var(--theme-text-muted))" }}>Security</button>
                                        <ChevronRight className="h-3 w-3" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                        <span className="text-sm font-semibold" style={{ color: "rgb(var(--theme-text))" }}>{section?.title}</span>
                                    </div>
                                    {Page ? <Page /> : null}
                                </motion.div>
                            );
                        })() : (
                            <motion.div key="grid" initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: 0.2 }}>
                                <p className="text-sm mb-4" style={{ color: "rgb(var(--theme-text-muted))" }}>Authentication providers, firewall policies, and AI configuration.</p>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {securitySections.map((s) => (
                                        <motion.button key={s.href} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSecurityDrill(s.href)} className="text-left w-full">
                                            <Card className="hover:border-blue-500/50 transition-colors cursor-pointer h-full" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>{s.icon}{s.title}</CardTitle>
                                                    <ChevronRight className="h-4 w-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                                </CardHeader>
                                                <CardContent><CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>{s.description}</CardDescription></CardContent>
                                            </Card>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </TabsContent>

                {/* ── Projects Tab ─────────────────────────────────────────── */}
                <TabsContent value="projects" className="space-y-6">
                    <ProjectsPage />
                </TabsContent>

                {/* ── Users Tab (admin/superuser only) ──────────────────── */}
                {!projectLoading && isSuperAdmin && (
                    <TabsContent value="users" className="space-y-6">
                        <UsersPage />
                    </TabsContent>
                )}

                {/* ── Teams Tab (admin/superuser only) ──────────────────── */}
                {!projectLoading && isSuperAdmin && (
                    <TabsContent value="teams" className="space-y-6">
                        <TeamsPage />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="space-y-6 p-4" style={{ color: "rgb(var(--theme-text-muted))" }}>Loading settings...</div>}>
            <SettingsContent />
        </Suspense>
    );
}
