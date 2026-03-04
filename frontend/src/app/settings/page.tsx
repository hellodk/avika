"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Save, Check, Loader2 } from "lucide-react";
import { useUserSettings } from "@/lib/user-settings";
import { toast } from "sonner";

import Link from "next/link";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { IntegrationSettings } from "@/components/settings/integration-settings";
import { DisplaySettings } from "@/components/settings/display-settings";
import { TelemetrySettings } from "@/components/settings/telemetry-settings";
import { AIEngineSettings } from "@/components/settings/ai-engine-settings";
import { AgentManagement } from "@/components/settings/agent-management";
import { Zap, Lock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
    const { settings: userSettings, updateSettings, resetSettings } = useUserSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [grafanaUrl, setGrafanaUrl] = useState(userSettings.integrations.grafanaUrl);
    const [clickhouseUrl, setClickhouseUrl] = useState(userSettings.integrations.clickhouseUrl);
    const [prometheusUrl, setPrometheusUrl] = useState(userSettings.integrations.prometheusUrl);

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
        setDefaultTimeRange(userSettings.display.defaultTimeRange);
        setRefreshInterval(userSettings.display.refreshInterval);
        setTimezone(userSettings.display.timezone);
        setCollectionInterval(userSettings.telemetry?.collectionInterval || "10");
        setRetentionDays(userSettings.telemetry?.retentionDays || "30");
        setAnomalyThreshold(userSettings.aiEngine?.anomalyThreshold || "0.8");
        setWindowSize(userSettings.aiEngine?.windowSize || "200");
    }, [userSettings]);

    const integrationsChanged = useMemo(() => {
        return (
            grafanaUrl !== userSettings.integrations.grafanaUrl ||
            clickhouseUrl !== userSettings.integrations.clickhouseUrl ||
            prometheusUrl !== userSettings.integrations.prometheusUrl
        );
    }, [
        clickhouseUrl,
        grafanaUrl,
        prometheusUrl,
        userSettings.integrations.clickhouseUrl,
        userSettings.integrations.grafanaUrl,
        userSettings.integrations.prometheusUrl
    ]);

    const displayChanged = useMemo(() => {
        return (
            defaultTimeRange !== userSettings.display.defaultTimeRange ||
            refreshInterval !== userSettings.display.refreshInterval ||
            timezone !== userSettings.display.timezone
        );
    }, [
        defaultTimeRange,
        refreshInterval,
        timezone,
        userSettings.display.defaultTimeRange,
        userSettings.display.refreshInterval,
        userSettings.display.timezone
    ]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            updateSettings({
                integrations: {
                    grafanaUrl: grafanaUrl.trim(),
                    clickhouseUrl: clickhouseUrl.trim(),
                    prometheusUrl: prometheusUrl.trim(),
                },
                display: {
                    defaultTimeRange,
                    refreshInterval,
                    timezone,
                },
                telemetry: {
                    collectionInterval,
                    retentionDays,
                },
                aiEngine: {
                    anomalyThreshold,
                    windowSize,
                }
            });

            try {
                localStorage.setItem("grafana_url", grafanaUrl.trim());
            } catch {
                // ignore
            }

            const res = await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collection_interval: parseInt(collectionInterval),
                    retention_days: parseInt(retentionDays),
                    anomaly_threshold: parseFloat(anomalyThreshold),
                    window_size: parseInt(windowSize),
                    grafana_url: grafanaUrl
                })
            });

            if (res.ok) {
                setSaveSuccess(true);
                toast.success("Settings saved", { description: "Your configuration has been updated." });
            } else {
                toast.success("Settings saved", { description: "Configuration saved locally." });
                setSaveSuccess(true);
            }
        } catch (error: any) {
            toast.success("Settings saved", { description: "Configuration saved locally." });
            setSaveSuccess(true);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveSuccess(false), 3000);
        }
    };

    const handleResetDefaults = () => {
        resetSettings();
        try {
            localStorage.removeItem("grafana_url");
        } catch {
            // ignore
        }
        toast.success("Defaults restored", { description: "Integrations and display preferences reset to defaults." });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--theme-text))' }}>Settings</h1>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Configure your NGINX AI Manager</p>
                </div>
            </div>

            <AppearanceSettings />

            <div className="grid gap-4 md:grid-cols-2">
                <Link href="/settings/llm">
                    <Card className="hover:border-blue-500/50 transition-colors cursor-pointer h-full" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                                <Zap className="h-4 w-4 text-amber-500" />
                                LLM Settings
                            </CardTitle>
                            <ChevronRight className="h-4 w-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
                        </CardHeader>
                        <CardContent>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Configure AI providers (OpenAI, Anthropic, Ollama) for error analysis and recommendations.
                            </CardDescription>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/waf">
                    <Card className="hover:border-blue-500/50 transition-colors cursor-pointer h-full" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text))" }}>
                                <Lock className="h-4 w-4 text-purple-500" />
                                WAF Policies
                            </CardTitle>
                            <ChevronRight className="h-4 w-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
                        </CardHeader>
                        <CardContent>
                            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Manage Web Application Firewall rule sets and distribution across your NGINX fleet.
                            </CardDescription>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <IntegrationSettings
                grafanaUrl={grafanaUrl}
                setGrafanaUrl={setGrafanaUrl}
                clickhouseUrl={clickhouseUrl}
                setClickhouseUrl={setClickhouseUrl}
                prometheusUrl={prometheusUrl}
                setPrometheusUrl={setPrometheusUrl}
                integrationsChanged={integrationsChanged}
            />

            <DisplaySettings
                defaultTimeRange={defaultTimeRange}
                setDefaultTimeRange={setDefaultTimeRange}
                refreshInterval={refreshInterval}
                setRefreshInterval={setRefreshInterval}
                timezone={timezone}
                setTimezone={setTimezone}
                displayChanged={displayChanged}
            />

            <div className="grid gap-6 md:grid-cols-2">
                <TelemetrySettings
                    collectionInterval={collectionInterval}
                    setCollectionInterval={setCollectionInterval}
                    retentionDays={retentionDays}
                    setRetentionDays={setRetentionDays}
                />

                <AIEngineSettings
                    anomalyThreshold={anomalyThreshold}
                    setAnomalyThreshold={setAnomalyThreshold}
                    windowSize={windowSize}
                    setWindowSize={setWindowSize}
                />

                <AgentManagement />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <Button
                    variant="outline"
                    onClick={handleResetDefaults}
                    className="min-w-[140px]"
                    style={{
                        backgroundColor: 'rgb(var(--theme-surface))',
                        color: 'rgb(var(--theme-text))',
                        borderColor: 'rgb(var(--theme-border))'
                    }}
                >
                    Reset Defaults
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`min-w-[140px] transition-all ${saveSuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : saveSuccess ? (
                        <>
                            <Check className="h-4 w-4 mr-2" />
                            Changes Saved
                        </>
                    ) : (
                        <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
