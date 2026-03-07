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
import { RefreshButton } from "@/components/ui/refresh-button";

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
          <RefreshButton
            loading={loading}
            onRefresh={load}
            aria-label="Refresh LLM settings"
            size="default"
          />
          <Button onClick={test} disabled={testing || loading} variant="outline" style={{ borderColor: 'rgb(var(--theme-border))' }}>
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
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Provider</Label>
            <Select value={cfg.provider} onValueChange={(v) => setCfg((p) => ({ ...p, provider: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Mock</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="azure">Azure OpenAI</SelectItem>
                <SelectItem value="lmstudio">LM Studio</SelectItem>
                <SelectItem value="llamacpp">llama.cpp</SelectItem>
                <SelectItem value="vllm">vLLM</SelectItem>
                <SelectItem value="vllm_metal">vLLM Metal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Model</Label>
            <Input
              value={cfg.model}
              onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              placeholder="gpt-4.1-mini / claude-3-5-sonnet / llama3.1"
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Base URL (optional)</Label>
            <Input
              value={cfg.base_url}
              onChange={(e) => setCfg((p) => ({ ...p, base_url: e.target.value }))}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              placeholder={
                { lmstudio: "http://localhost:1234/v1", ollama: "http://localhost:11434", llamacpp: "http://localhost:8080/v1", vllm: "http://localhost:8000/v1", vllm_metal: "http://localhost:8000/v1" }[cfg.provider] ?? "https://api.openai.com"
              }
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>API Key</Label>
            <Input
              type="password"
              value={cfg.api_key || ""}
              onChange={(e) => setCfg((p) => ({ ...p, api_key: e.target.value }))}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
              placeholder={cfg.api_key_set ? "•••••••• (set)" : "Enter API key"}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Max tokens</Label>
            <Input
              type="number"
              value={cfg.max_tokens}
              onChange={(e) => setCfg((p) => ({ ...p, max_tokens: Number(e.target.value) }))}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
            />
          </div>

          <div className="space-y-2">
            <Label style={{ color: 'rgb(var(--theme-text-muted))' }}>Temperature</Label>
            <Input
              type="number"
              step="0.1"
              value={cfg.temperature}
              onChange={(e) => setCfg((p) => ({ ...p, temperature: Number(e.target.value) }))}
              style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))', color: 'rgb(var(--theme-text))' }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

