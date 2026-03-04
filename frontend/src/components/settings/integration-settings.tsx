import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LineChart, ExternalLink } from "lucide-react";
import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";
import { useMemo } from "react";

interface IntegrationSettingsProps {
    grafanaUrl: string;
    setGrafanaUrl: (val: string) => void;
    clickhouseUrl: string;
    setClickhouseUrl: (val: string) => void;
    prometheusUrl: string;
    setPrometheusUrl: (val: string) => void;
    integrationsChanged: boolean;
}

export function IntegrationSettings({
    grafanaUrl,
    setGrafanaUrl,
    clickhouseUrl,
    setClickhouseUrl,
    prometheusUrl,
    setPrometheusUrl,
    integrationsChanged,
}: IntegrationSettingsProps) {
    return (
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
    );
}
