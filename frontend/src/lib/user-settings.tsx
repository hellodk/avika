"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type IntegrationsSettings = {
  grafanaUrl: string;
  clickhouseUrl: string;
  prometheusUrl: string;
};

export type DisplaySettings = {
  defaultTimeRange: string; // e.g. "now-1h"
  refreshInterval: string; // e.g. "30s"
  timezone: string; // "browser" or IANA TZ
};

export type TelemetrySettings = {
  collectionInterval: string;
  retentionDays: string;
};

export type AIEngineSettings = {
  anomalyThreshold: string;
  windowSize: string;
};

export type UserSettings = {
  integrations: IntegrationsSettings;
  display: DisplaySettings;
  telemetry: TelemetrySettings;
  aiEngine: AIEngineSettings;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  integrations: {
    // Default Grafana in-cluster FQDN (typical install). Can be overridden in Settings at runtime.
    grafanaUrl: "http://monitoring-grafana.monitoring.svc.cluster.local",
    clickhouseUrl: "",
    prometheusUrl: "",
  },
  display: {
    defaultTimeRange: "now-1h",
    refreshInterval: "30s",
    timezone: "browser",
  },
  telemetry: {
    collectionInterval: "10",
    retentionDays: "30",
  },
  aiEngine: {
    anomalyThreshold: "0.8",
    windowSize: "200",
  },
};

const STORAGE_KEY = "avika-user-settings";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredSettings(raw: string | null): Partial<UserSettings> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    return parsed as Partial<UserSettings>;
  } catch {
    return null;
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function mergeSettings(base: UserSettings, patch: DeepPartial<UserSettings>): UserSettings {
  const integrationsPatch = isObject(patch.integrations) ? (patch.integrations as Partial<IntegrationsSettings>) : {};
  const displayPatch = isObject(patch.display) ? (patch.display as Partial<DisplaySettings>) : {};
  const telemetryPatch = isObject(patch.telemetry) ? (patch.telemetry as Partial<TelemetrySettings>) : {};
  const aiEnginePatch = isObject(patch.aiEngine) ? (patch.aiEngine as Partial<AIEngineSettings>) : {};

  return {
    integrations: {
      ...base.integrations,
      ...integrationsPatch,
    },
    display: {
      ...base.display,
      ...displayPatch,
    },
    telemetry: {
      ...base.telemetry,
      ...telemetryPatch,
    },
    aiEngine: {
      ...base.aiEngine,
      ...aiEnginePatch,
    },
  };
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.replace(/\/+$/, "");
}

type UserSettingsContextValue = {
  settings: UserSettings;
  setSettings: (next: UserSettings) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  resetSettings: () => void;
  getGrafanaBaseUrl: () => string;
};

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load from localStorage once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = parseStoredSettings(window.localStorage.getItem(STORAGE_KEY));
    const legacyGrafanaUrl = window.localStorage.getItem("grafana_url")?.trim() || "";

    const merged = stored ? mergeSettings(DEFAULT_USER_SETTINGS, stored) : DEFAULT_USER_SETTINGS;
    const migrated = legacyGrafanaUrl
      ? mergeSettings(merged, { integrations: { grafanaUrl: legacyGrafanaUrl } })
      : merged;

    setSettingsState(migrated);
    setHasLoaded(true);
  }, []);

  // Persist to localStorage after initial load.
  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore write failures (private mode, storage full, etc.)
    }
  }, [settings, hasLoaded]);

  const setSettings = useCallback((next: UserSettings) => {
    setSettingsState(mergeSettings(DEFAULT_USER_SETTINGS, next));
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettingsState((prev) => mergeSettings(prev, patch));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_USER_SETTINGS);
  }, []);

  const getGrafanaBaseUrl = useCallback(() => {
    const candidate =
      normalizeBaseUrl(settings.integrations.grafanaUrl) ||
      normalizeBaseUrl(process.env.NEXT_PUBLIC_GRAFANA_URL || "") ||
      normalizeBaseUrl(DEFAULT_USER_SETTINGS.integrations.grafanaUrl);

    return candidate;
  }, [settings.integrations.grafanaUrl]);

  const value = useMemo<UserSettingsContextValue>(
    () => ({ settings, setSettings, updateSettings, resetSettings, getGrafanaBaseUrl }),
    [settings, setSettings, updateSettings, resetSettings, getGrafanaBaseUrl],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings(): UserSettingsContextValue {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) throw new Error("useUserSettings must be used within UserSettingsProvider");
  return ctx;
}

