import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";

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

interface DisplaySettingsProps {
    defaultTimeRange: string;
    setDefaultTimeRange: (val: string) => void;
    refreshInterval: string;
    setRefreshInterval: (val: string) => void;
    timezone: string;
    setTimezone: (val: string) => void;
    displayChanged: boolean;
}

export function DisplaySettings({
    defaultTimeRange,
    setDefaultTimeRange,
    refreshInterval,
    setRefreshInterval,
    timezone,
    setTimezone,
    displayChanged
}: DisplaySettingsProps) {
    return (
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Display Preferences</CardTitle>
                </div>
                <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                    Defaults used across dashboards.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="default-time-range" style={{ color: 'rgb(var(--theme-text))' }}>Default Time Range</Label>
                    <Select value={defaultTimeRange} onValueChange={setDefaultTimeRange}>
                        <SelectTrigger
                            id="default-time-range"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            <SelectValue placeholder="Select time range" />
                        </SelectTrigger>
                        <SelectContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                            {TIME_RANGES.map((range) => (
                                <SelectItem key={range.value} value={range.value}>
                                    {range.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="default-refresh-interval" style={{ color: 'rgb(var(--theme-text))' }}>Default Refresh Interval</Label>
                    <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                        <SelectTrigger
                            id="default-refresh-interval"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            <SelectValue placeholder="Select refresh interval" />
                        </SelectTrigger>
                        <SelectContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                            {REFRESH_INTERVALS.map((interval) => (
                                <SelectItem key={interval.value} value={interval.value || "off"}>
                                    {interval.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="default-timezone" style={{ color: 'rgb(var(--theme-text))' }}>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger
                            id="default-timezone"
                            style={{
                                background: "rgb(var(--theme-surface-light))",
                                borderColor: "rgb(var(--theme-border))",
                                color: "rgb(var(--theme-text))"
                            }}
                        >
                            <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
                            {TIMEZONES.map((tz) => (
                                <SelectItem key={tz.value} value={tz.value}>
                                    {tz.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        "Browser" uses your local timezone.
                    </p>
                </div>

                {displayChanged && (
                    <p className="text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        Changes will apply after you click <span className="font-medium">Save Changes</span>.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
