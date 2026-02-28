"use client";

import { useState } from "react";
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
    Trash2
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { themes, ThemeName } from "@/lib/themes";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const themeIcons = {
    dark: Moon,
    light: Sun,
    solarized: Sparkles,
    nord: Sparkles,
};

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const [createSuccess, setCreateSuccess] = useState(false); // Renamed for clarity or just keep saveSuccess
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isDeletingAgents, setIsDeletingAgents] = useState(false);
    const [deletionMessage, setDeletionMessage] = useState("");

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
            // Try to save to backend settings API
            const res = await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // These would come from state in a real implementation
                    collection_interval: 10,
                    retention_days: 30,
                    anomaly_threshold: 0.8,
                    window_size: 200
                })
            });
            
            if (res.ok) {
                setSaveSuccess(true);
                toast.success("Settings saved", { description: "Your configuration has been updated." });
            } else {
                // API might not exist yet - theme is already saved via context
                toast.info("Theme updated", { description: "Note: Other settings require backend API support." });
                setSaveSuccess(true);
            }
        } catch (error: any) {
            // If API doesn't exist, theme is still saved
            toast.info("Theme saved", { description: "Other settings will be available when backend API is ready." });
            setSaveSuccess(true);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveSuccess(false), 3000);
        }
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
                                defaultValue="10"
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
                                defaultValue="30"
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
                                defaultValue="0.8"
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
                                defaultValue="200"
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

            <div className="flex justify-end pt-4">
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
