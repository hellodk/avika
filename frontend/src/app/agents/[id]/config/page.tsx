"use client";

import { use, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, RefreshCw, Trash2, PlugZap, ShieldAlert } from "lucide-react";

type AgentConfigResponse = {
  gateway_address: string;
  agent_id: string;
  labels: Record<string, string>;
  health_port: number;
  mgmt_port: number;
  nginx_config_path: string;
  nginx_status_url: string;
  access_log_path: string;
  error_log_path: string;
  log_format: string;
  buffer_dir: string;
  update_server: string;
  update_interval: string;
  log_level: string;
  log_file: string;
  config_file_path: string;
};

export default function AgentConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<AgentConfigResponse | null>(null);
  const [labels, setLabels] = useState<Array<{ key: string; value: string }>>([]);
  const [lastUpdateResult, setLastUpdateResult] = useState<{ requires_restart?: boolean } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const labelsMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const kv of labels) {
      const k = kv.key.trim();
      if (!k) continue;
      out[k] = kv.value ?? "";
    }
    return out;
  }, [labels]);

  const load = async () => {
    setLoading(true);
    setLastUpdateResult(null);
    try {
      const res = await apiFetch(`/api/agents/${id}/config`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch agent config");
      }
      setCfg(data);
      const pairs = Object.entries(data.labels || {}).map(([k, v]) => ({ key: k, value: String(v) }));
      setLabels(pairs.length ? pairs : []);
    } catch (e: unknown) {
      toast.error("Failed to load agent config", { description: errMsg(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addLabel = () => setLabels((prev) => [...prev, { key: "", value: "" }]);
  const removeLabel = (idx: number) => setLabels((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {
        GATEWAYS: cfg.gateway_address || "",
        AGENT_ID: cfg.agent_id || id,
        HEALTH_PORT: String(cfg.health_port ?? ""),
        MGMT_PORT: String(cfg.mgmt_port ?? ""),
        NGINX_CONFIG_PATH: cfg.nginx_config_path || "",
        NGINX_STATUS_URL: cfg.nginx_status_url || "",
        ACCESS_LOG_PATH: cfg.access_log_path || "",
        ERROR_LOG_PATH: cfg.error_log_path || "",
        LOG_FORMAT: cfg.log_format || "",
        BUFFER_DIR: cfg.buffer_dir || "",
        UPDATE_SERVER: cfg.update_server || "",
        UPDATE_INTERVAL: cfg.update_interval || "",
        LOG_LEVEL: cfg.log_level || "",
        LOG_FILE: cfg.log_file || "",
      };

      for (const [k, v] of Object.entries(labelsMap)) {
        updates[`LABEL_${k}`] = v;
      }

      const res = await apiFetch(`/api/agents/${id}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, persist: true, hot_reload: true }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Update failed");
      }
      setLastUpdateResult({ requires_restart: Boolean(data?.requires_restart) });
      toast.success("Agent config updated", {
        description: data?.requires_restart ? "Some changes require an agent restart." : "Applied successfully.",
      });
      await load();
    } catch (e: unknown) {
      toast.error("Failed to update agent config", { description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  const test = async (test_type: string) => {
    setTesting(test_type);
    try {
      const res = await apiFetch(`/api/agents/${id}/config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_type }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        toast.error("Connection test failed", { description: data?.message || data?.error || "Failed" });
        return;
      }
      toast.success("Connection test OK", { description: data?.message || "Success" });
    } catch (e: unknown) {
      toast.error("Connection test failed", { description: errMsg(e) });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
            Agent Runtime Config
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Agent: <span className="font-mono">{id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading} style={{ borderColor: 'rgb(var(--theme-border))' }}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || loading || !cfg} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {lastUpdateResult?.requires_restart && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            <div>
              <div className="font-medium text-amber-200">Restart required</div>
              <div className="text-sm text-amber-200/80">Some changes will take effect after the agent restarts.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader>
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Connectivity</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
              Test agent-side connectivity using its current settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => test("gateway")}
              disabled={testing !== null}
              style={{ borderColor: 'rgb(var(--theme-border))' }}
            >
              <PlugZap className="h-4 w-4 mr-2" />
              {testing === "gateway" ? "Testing..." : "Test Gateway"}
            </Button>
            <Button
              variant="outline"
              onClick={() => test("nginx_status")}
              disabled={testing !== null}
              style={{ borderColor: 'rgb(var(--theme-border))' }}
            >
              <PlugZap className="h-4 w-4 mr-2" />
              {testing === "nginx_status" ? "Testing..." : "Test NGINX Status"}
            </Button>
            <Button
              variant="outline"
              onClick={() => test("update_server")}
              disabled={testing !== null}
              style={{ borderColor: 'rgb(var(--theme-border))' }}
            >
              <PlugZap className="h-4 w-4 mr-2" />
              {testing === "update_server" ? "Testing..." : "Test Update Server"}
            </Button>
          </CardContent>
        </Card>

        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader>
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Labels</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
              Used for auto-assignment / grouping.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {labels.length === 0 && (
              <div className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                No labels set.
              </div>
            )}
            {labels.map((kv, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={kv.key}
                  onChange={(e) =>
                    setLabels((prev) => prev.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p)))
                  }
                  placeholder="key"
                  style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                />
                <Input
                  value={kv.value}
                  onChange={(e) =>
                    setLabels((prev) => prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)))
                  }
                  placeholder="value"
                  style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeLabel(idx)}
                  className="text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={addLabel} style={{ borderColor: 'rgb(var(--theme-border))' }}>
              <Plus className="h-4 w-4 mr-2" />
              Add label
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Runtime Settings</CardTitle>
              <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                Saved to <span className="font-mono">{cfg?.config_file_path || "avika-agent.conf"}</span>
              </CardDescription>
            </div>
            {cfg?.config_file_path && (
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Persisted</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Gateway Address(es)</Label>
            <Input
              value={cfg?.gateway_address || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, gateway_address: e.target.value })}
              placeholder="gateway:5020,gateway2:5020"
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Update Interval</Label>
            <Input
              value={cfg?.update_interval || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, update_interval: e.target.value })}
              placeholder="168h"
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Update Server</Label>
            <Input
              value={cfg?.update_server || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, update_server: e.target.value })}
              placeholder="http://gateway:8090"
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Buffer Dir</Label>
            <Input
              value={cfg?.buffer_dir || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, buffer_dir: e.target.value })}
              placeholder="/var/lib/avika/buffer"
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Health Port</Label>
            <Input
              type="number"
              value={cfg?.health_port ?? 0}
              onChange={(e) => cfg && setCfg({ ...cfg, health_port: Number(e.target.value) })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Mgmt Port</Label>
            <Input
              type="number"
              value={cfg?.mgmt_port ?? 0}
              onChange={(e) => cfg && setCfg({ ...cfg, mgmt_port: Number(e.target.value) })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>NGINX Status URL</Label>
            <Input
              value={cfg?.nginx_status_url || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, nginx_status_url: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>NGINX Config Path</Label>
            <Input
              value={cfg?.nginx_config_path || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, nginx_config_path: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Access Log Path</Label>
            <Input
              value={cfg?.access_log_path || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, access_log_path: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Error Log Path</Label>
            <Input
              value={cfg?.error_log_path || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, error_log_path: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Log Format</Label>
            <Input
              value={cfg?.log_format || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, log_format: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Log Level</Label>
            <Input
              value={cfg?.log_level || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, log_level: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Log File</Label>
            <Input
              value={cfg?.log_file || ""}
              onChange={(e) => cfg && setCfg({ ...cfg, log_file: e.target.value })}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              disabled={!cfg}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

