import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";

interface AIEngineSettingsProps {
    anomalyThreshold: string;
    setAnomalyThreshold: (val: string) => void;
    windowSize: string;
    setWindowSize: (val: string) => void;
}

export function AIEngineSettings({
    anomalyThreshold,
    setAnomalyThreshold,
    windowSize,
    setWindowSize,
}: AIEngineSettingsProps) {
    return (
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-orange-500" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>AI Engine Settings</CardTitle>
                </div>
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
    );
}
