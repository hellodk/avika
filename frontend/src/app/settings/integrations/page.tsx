"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Save, PlugZap } from "lucide-react";

type IntegrationRow = {
  type: string;
  config: Record<string, any>;
  is_enabled: boolean;
  test_result?: Record<string, any>;
  last_tested_at?: string;
};

function IntegrationCard({
  title,
  description,
  row,
  onChange,
  onSave,
  onTest,
  saving,
  testing,
}: {
  title: string;
  description: string;
  row: IntegrationRow;
  onChange: (row: IntegrationRow) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
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
            <p className="text-xs" style={{ color: 'rgb(var(--theme-text-dim))' }}>Persisted in the gateway database</p>
          </div>
          <Switch checked={row.is_enabled} onCheckedChange={(v) => onChange({ ...row, is_enabled: v })} />
        </div>

        {row.type === "grafana" && (
          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>URL</Label>
            <Input
              value={row.config.url || ""}
              onChange={(e) => onChange({ ...row, config: { ...row.config, url: e.target.value } })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              placeholder="https://grafana.example.com"
            />
          </div>
        )}

        {row.type === "webhook" && (
          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>URL</Label>
            <Input
              value={row.config.url || ""}
              onChange={(e) => onChange({ ...row, config: { ...row.config, url: e.target.value } })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              placeholder="https://example.com/webhook"
            />
          </div>
        )}

        {row.type === "smtp" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Host</Label>
              <Input
                value={row.config.host || ""}
                onChange={(e) => onChange({ ...row, config: { ...row.config, host: e.target.value } })}
                style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Port</Label>
              <Input
                type="number"
                value={row.config.port ?? 25}
                onChange={(e) => onChange({ ...row, config: { ...row.config, port: Number(e.target.value) } })}
                style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={onTest} disabled={testing} variant="outline" style={{ borderColor: 'rgb(var(--theme-border))' }}>
            <PlugZap className="h-4 w-4 mr-2" />
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntegrationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, IntegrationRow>>({
    grafana: { type: "grafana", config: {}, is_enabled: false },
    webhook: { type: "webhook", config: {}, is_enabled: false },
    smtp: { type: "smtp", config: {}, is_enabled: false },
  });
  const [savingType, setSavingType] = useState<string | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/integrations");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load integrations");
      const next = { ...rows };
      for (const row of data as IntegrationRow[]) {
        next[row.type] = row;
      }
      setRows(next);
    } catch (e: any) {
      toast.error("Failed to load integrations", { description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (type: string) => {
    setSavingType(type);
    try {
      const res = await apiFetch(`/api/integrations/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows[type]),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      toast.success("Integration saved");
      await load();
    } catch (e: any) {
      toast.error("Failed to save integration", { description: e?.message || String(e) });
    } finally {
      setSavingType(null);
    }
  };

  const test = async (type: string) => {
    setTestingType(type);
    try {
      const res = await apiFetch(`/api/integrations/${type}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || data?.message || "Test failed");
      }
      toast.success("Test OK", { description: data?.message || type });
      await load();
    } catch (e: any) {
      toast.error("Test failed", { description: e?.message || String(e) });
    } finally {
      setTestingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
            Integrations
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Configure external integrations persisted in the gateway database.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="border-neutral-700">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <IntegrationCard
          title="Grafana"
          description="Used for embedded dashboards and links."
          row={rows.grafana}
          onChange={(r) => setRows((p) => ({ ...p, grafana: r }))}
          onSave={() => save("grafana")}
          onTest={() => test("grafana")}
          saving={savingType === "grafana"}
          testing={testingType === "grafana"}
        />
        <IntegrationCard
          title="Webhook"
          description="Generic outbound webhook endpoint."
          row={rows.webhook}
          onChange={(r) => setRows((p) => ({ ...p, webhook: r }))}
          onSave={() => save("webhook")}
          onTest={() => test("webhook")}
          saving={savingType === "webhook"}
          testing={testingType === "webhook"}
        />
        <IntegrationCard
          title="SMTP"
          description="Basic SMTP connectivity test (TCP dial)."
          row={rows.smtp}
          onChange={(r) => setRows((p) => ({ ...p, smtp: r }))}
          onSave={() => save("smtp")}
          onTest={() => test("smtp")}
          saving={savingType === "smtp"}
          testing={testingType === "smtp"}
        />
      </div>
    </div>
  );
}

