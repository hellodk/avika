"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save, PlugZap } from "lucide-react";

type LLMConfig = {
  provider: string;
  api_key?: string;
  api_key_set: boolean;
  model: string;
  base_url: string;
  max_tokens: number;
  temperature: number;
  timeout_seconds: number;
  retry_attempts: number;
  rate_limit_rpm: number;
  fallback_provider: string;
  enable_caching: boolean;
  cache_ttl_minutes: number;
  enabled: boolean;
};

export default function LLMSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cfg, setCfg] = useState<LLMConfig>({
    provider: "mock",
    api_key_set: false,
    model: "",
    base_url: "",
    max_tokens: 4096,
    temperature: 0.7,
    timeout_seconds: 30,
    retry_attempts: 2,
    rate_limit_rpm: 60,
    fallback_provider: "",
    enable_caching: true,
    cache_ttl_minutes: 60,
    enabled: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/llm/config");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setCfg((prev) => ({
        ...prev,
        ...data,
        api_key: "",
      }));
    } catch (e: any) {
      toast.error("Failed to load LLM config", { description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/llm/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      toast.success("LLM config saved");
      await load();
    } catch (e: any) {
      toast.error("Failed to save LLM config", { description: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await apiFetch("/api/llm/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Test failed");
      }
      toast.success("LLM connection OK", { description: `${data.provider} • ${data.model}` });
    } catch (e: any) {
      toast.error("LLM connection failed", { description: e?.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
            LLM Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Configure provider, credentials, and defaults for AI features.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="border-neutral-700">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={test} disabled={testing || loading} variant="outline" className="border-neutral-700">
            <PlugZap className="h-4 w-4 mr-2" />
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button onClick={save} disabled={saving || loading} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
        <CardHeader>
          <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Provider</CardTitle>
          <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
            API key is write-only; it will not be shown after save.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-neutral-300">Provider</Label>
            <Select value={cfg.provider} onValueChange={(v) => setCfg((p) => ({ ...p, provider: v }))}>
              <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800">
                <SelectItem value="mock">Mock</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="azure">Azure OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Model</Label>
            <Input
              value={cfg.model}
              onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))}
              className="bg-neutral-950 border-neutral-800 text-white"
              placeholder="gpt-4.1-mini / claude-3-5-sonnet / llama3.1"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Base URL (optional)</Label>
            <Input
              value={cfg.base_url}
              onChange={(e) => setCfg((p) => ({ ...p, base_url: e.target.value }))}
              className="bg-neutral-950 border-neutral-800 text-white"
              placeholder="https://api.openai.com"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">API Key</Label>
            <Input
              type="password"
              value={cfg.api_key || ""}
              onChange={(e) => setCfg((p) => ({ ...p, api_key: e.target.value }))}
              className="bg-neutral-950 border-neutral-800 text-white"
              placeholder={cfg.api_key_set ? "•••••••• (set)" : "Enter API key"}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Max tokens</Label>
            <Input
              type="number"
              value={cfg.max_tokens}
              onChange={(e) => setCfg((p) => ({ ...p, max_tokens: Number(e.target.value) }))}
              className="bg-neutral-950 border-neutral-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Temperature</Label>
            <Input
              type="number"
              step="0.1"
              value={cfg.temperature}
              onChange={(e) => setCfg((p) => ({ ...p, temperature: Number(e.target.value) }))}
              className="bg-neutral-950 border-neutral-800 text-white"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

