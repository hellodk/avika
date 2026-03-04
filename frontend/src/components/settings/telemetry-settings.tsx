import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Activity } from "lucide-react";

interface TelemetrySettingsProps {
    collectionInterval: string;
    setCollectionInterval: (val: string) => void;
    retentionDays: string;
    setRetentionDays: (val: string) => void;
}

export function TelemetrySettings({
    collectionInterval,
    setCollectionInterval,
    retentionDays,
    setRetentionDays,
}: TelemetrySettingsProps) {
    return (
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-500" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Telemetry Settings</CardTitle>
                </div>
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
    );
}
