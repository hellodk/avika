"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Settings,
    Save,
    Palette,
    Check,
    Moon,
    Sun,
    Sparkles,
    ChevronDown,
    Loader2,
    Trash2,
    Eclipse,
    Building2,
    LineChart,
    ExternalLink
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { themes, ThemeName } from "@/lib/themes";
import { DEFAULT_USER_SETTINGS, useUserSettings } from "@/lib/user-settings";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const themeIcons: Record<string, typeof Moon> = {
    dark: Moon,
    light: Sun,
    solarized: Sparkles,
    nord: Sparkles,
    corporate: Building2,
    midnight: Eclipse,
};

const TIME_RANGES = [
    { label: "Last 15m", value: "now-15m" },
    { label: "Last 1h", value: "now-1h" },
    { label: "Last 6h", value: "now-6h" },
    { label: "Last 24h", value: "now-24h" },
    { label: "Last 7d", value: "now-7d" },
];

const REFRESH_INTERVALS = [
    { label: "Off", value: "" },
    { label: "5s", value: "5s" },
    { label: "10s", value: "10s" },
    { label: "30s", value: "30s" },
    { label: "1m", value: "1m" },
    { label: "5m", value: "5m" },
];

const TIMEZONES = [
    { label: "Browser", value: "browser" },
    { label: "UTC", value: "UTC" },
];

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { settings: userSettings, updateSettings, resetSettings } = useUserSettings();
    const [createSuccess, setCreateSuccess] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isDeletingAgents, setIsDeletingAgents] = useState(false);
    const [deletionMessage, setDeletionMessage] = useState("");
    const [grafanaUrl, setGrafanaUrl] = useState(DEFAULT_GRAFANA_URL);

    useEffect(() => {
        setGrafanaUrl(userSettings.integrations.grafanaUrl);
        setClickhouseUrl(userSettings.integrations.clickhouseUrl);
        setPrometheusUrl(userSettings.integrations.prometheusUrl);
        setDefaultTimeRange(userSettings.display.defaultTimeRange);
        setRefreshInterval(userSettings.display.refreshInterval);
        setTimezone(userSettings.display.timezone);
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

    const handleDeleteOfflineAgents = async () => {
        setIsDeletingAgents(true);
        setDeletionMessage("");
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error("Failed to fetch agents");
            const data = await res.json();
            const agents = data.agents || [];

            // Get agents not seen in last 10 minutes (offline)
            const now = Math.floor(Date.now() / 1000);
            const offlineAgents = agents.filter((a: any) => {
                if (!a.last_seen) return false;
                return (now - parseInt(a.last_seen)) > 600;
            });

            if (offlineAgents.length === 0) {
                toast.info("No offline agents found", { description: "All agents are currently online." });
                setIsDeletingAgents(false);
                return;
            }

            let deletedCount = 0;
            for (const agent of offlineAgents) {
                const id = agent.agent_id || agent.id;
                if (!id) continue;
                const delRes = await apiFetch(`/api/servers/${id}`, { method: 'DELETE' });
                if (delRes.ok) deletedCount++;
            }

            toast.success("Cleanup complete", { description: `Successfully deleted ${deletedCount} offline agents.` });
            setDeletionMessage(`Successfully deleted ${deletedCount} agents.`);
            setTimeout(() => setDeletionMessage(""), 3000);
        } catch (error: any) {
            console.error(error);
            toast.error("Cleanup failed", { description: error.message });
            setDeletionMessage("Error occurred during cleanup.");
        } finally {
            setIsDeletingAgents(false);
        }
    };

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
                }
            });

            // Legacy key (back-compat for older builds)
            try {
                localStorage.setItem("grafana_url", grafanaUrl.trim());
            } catch {
                // ignore
            }

            // Try to save to backend settings API
            const res = await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collection_interval: 10,
                    retention_days: 30,
                    anomaly_threshold: 0.8,
                    window_size: 200,
                    grafana_url: grafanaUrl
                })
            });

            if (res.ok) {
                setSaveSuccess(true);
                toast.success("Settings saved", { description: "Your configuration has been updated." });
            } else {
                // API might not exist yet - settings saved to localStorage
                toast.success("Settings saved", { description: "Configuration saved locally." });
                setSaveSuccess(true);
            }
        } catch (error: any) {
            // If API doesn't exist, settings are still saved to localStorage
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

    const ActiveThemeIcon = themeIcons[theme as ThemeName] || Palette;
    const activeThemeName = themes[theme as ThemeName]?.name || "Select Theme";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--theme-text))' }}>Settings</h1>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Configure your NGINX AI Manager</p>
                </div>
            </div>

            {/* Appearance Section */}
            <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Palette className="h-5 w-5 text-blue-500" />
                        <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Appearance</CardTitle>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Choose your preferred interface theme</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label style={{ color: 'rgb(var(--theme-text))' }}>Active Theme</Label>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-[240px] justify-between"
                                    style={{
                                        backgroundColor: 'rgb(var(--theme-surface-light))',
                                        color: 'rgb(var(--theme-text))',
                                        borderColor: 'rgb(var(--theme-border))'
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <ActiveThemeIcon className="h-4 w-4" />
                                        <span>{activeThemeName}</span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                className="w-[240px]"
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            >
                                {Object.entries(themes).map(([key, themeConfig]) => {
                                    const Icon = themeIcons[key as ThemeName] || Palette;
                                    const isActive = theme === key;
                                    return (
                                        <DropdownMenuItem
                                            key={key}
                                            onClick={() => setTheme(key as ThemeName)}
                                            className="flex items-center justify-between cursor-pointer"
                                            style={{ color: 'rgb(var(--theme-text))' }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                <span>{themeConfig.name}</span>
                                            </div>
                                            {isActive && <Check className="h-4 w-4 text-blue-500" />}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>

            {/* Integrations Section */}
            <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <LineChart className="h-5 w-5 text-purple-500" />
                        <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Integrations</CardTitle>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Configure external service connections</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="grafana-url" style={{ color: 'rgb(var(--theme-text))' }}>Grafana URL</Label>
                        <p className="text-xs mb-2" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            URL of your Grafana instance for embedded dashboards
                        </p>
                        <div className="flex gap-2">
                            <Input
                                id="grafana-url"
                                type="url"
                                value={grafanaUrl}
                                onChange={(e) => setGrafanaUrl(e.target.value)}
                                placeholder={DEFAULT_USER_SETTINGS.integrations.grafanaUrl}
                                className="flex-1"
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => window.open(grafanaUrl, '_blank')}
                                title="Test connection"
                                style={{
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            >
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            Default: <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgb(var(--theme-surface-light))' }}>
                                {DEFAULT_USER_SETTINGS.integrations.grafanaUrl}
                            </code>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clickhouse-url" style={{ color: 'rgb(var(--theme-text))' }}>ClickHouse URL (optional)</Label>
                        <Input
                            id="clickhouse-url"
                            type="url"
                            value={clickhouseUrl}
                            onChange={(e) => setClickhouseUrl(e.target.value)}
                            placeholder="http://clickhouse:8123"
                            style={{
                                backgroundColor: 'rgb(var(--theme-surface-light))',
                                color: 'rgb(var(--theme-text))',
                                borderColor: 'rgb(var(--theme-border))'
                            }}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="prometheus-url" style={{ color: 'rgb(var(--theme-text))' }}>Prometheus URL (optional)</Label>
                        <Input
                            id="prometheus-url"
                            type="url"
                            value={prometheusUrl}
                            onChange={(e) => setPrometheusUrl(e.target.value)}
                            placeholder="http://prometheus:9090"
                            style={{
                                backgroundColor: 'rgb(var(--theme-surface-light))',
                                color: 'rgb(var(--theme-text))',
                                borderColor: 'rgb(var(--theme-border))'
                            }}
                        />
                    </div>

                    {integrationsChanged && (
                        <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            Changes will apply after you click <span className="font-medium">Save Changes</span>.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Display Preferences */}
            <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                <CardHeader>
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Display Preferences</CardTitle>
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        Defaults used across dashboards.
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="default-time-range" style={{ color: 'rgb(var(--theme-text))' }}>Default Time Range</Label>
                        <select
                            id="default-time-range"
                            value={defaultTimeRange}
                            onChange={(e) => setDefaultTimeRange(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            {TIME_RANGES.map((range) => (
                                <option key={range.value} value={range.value}>
                                    {range.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="default-refresh-interval" style={{ color: 'rgb(var(--theme-text))' }}>Default Refresh Interval</Label>
                        <select
                            id="default-refresh-interval"
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            {REFRESH_INTERVALS.map((interval) => (
                                <option key={interval.value} value={interval.value}>
                                    {interval.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="default-timezone" style={{ color: 'rgb(var(--theme-text))' }}>Timezone</Label>
                        <select
                            id="default-timezone"
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            {TIMEZONES.map((tz) => (
                                <option key={tz.value} value={tz.value}>
                                    {tz.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            \"Browser\" uses your local timezone.
                        </p>
                    </div>

                    {displayChanged && (
                        <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                            Changes will apply after you click <span className="font-medium">Save Changes</span>.
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardHeader>
                        <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Telemetry Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="collection-interval" style={{ color: 'rgb(var(--theme-text))' }}>Collection Interval (seconds)</Label>
                            <Input
                                id="collection-interval"
                                type="number"
                                value={collectionInterval}
                                onChange={(e) => setCollectionInterval(e.target.value)}
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="retention-days" style={{ color: 'rgb(var(--theme-text))' }}>Data Retention (days)</Label>
                            <Input
                                id="retention-days"
                                type="number"
                                value={retentionDays}
                                onChange={(e) => setRetentionDays(e.target.value)}
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardHeader>
                        <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>AI Engine Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="anomaly-threshold" style={{ color: 'rgb(var(--theme-text))' }}>Anomaly Detection Threshold</Label>
                            <Input
                                id="anomaly-threshold"
                                type="number"
                                step="0.1"
                                value={anomalyThreshold}
                                onChange={(e) => setAnomalyThreshold(e.target.value)}
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="window-size" style={{ color: 'rgb(var(--theme-text))' }}>Window Size (samples)</Label>
                            <Input
                                id="window-size"
                                type="number"
                                value={windowSize}
                                onChange={(e) => setWindowSize(e.target.value)}
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>
                <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                    <CardHeader>
                        <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Agent Management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label style={{ color: 'rgb(var(--theme-text))' }}>Cleanup</Label>
                            <p className="text-sm text-slate-500 mb-2">Remove agents that are currently offline from the inventory.</p>
                            <Button
                                variant="destructive"
                                onClick={handleDeleteOfflineAgents}
                                disabled={isDeletingAgents}
                                className="w-full sm:w-auto"
                            >
                                {isDeletingAgents ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Cleaning up...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Offline Agents
                                    </>
                                )}
                            </Button>
                            {deletionMessage && (
                                <p className={`text-sm mt-2 ${deletionMessage.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}>
                                    {deletionMessage}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
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
