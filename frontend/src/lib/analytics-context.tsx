"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";

type AnalyticsSummary = {
  total_requests: number;
  error_rate: number;
  avg_latency: number;
  total_bandwidth: number;
  requests_delta?: number;
  latency_delta?: number;
  error_rate_delta?: number;
};

type AnalyticsData = {
  summary: AnalyticsSummary;
  request_rate: Record<string, unknown>[];
  status_distribution: Record<string, unknown>[];
  top_endpoints: Record<string, unknown>[];
  latency_trend: Record<string, unknown>[];
  latency_distribution: Record<string, unknown>[];
  server_distribution: Record<string, unknown>[];
  system_metrics: Record<string, unknown>[];
  connections_history: Record<string, unknown>[];
  http_status_metrics: Record<string, unknown> | null;
  gateway_metrics: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  recent_requests: Record<string, unknown>[];
};

type AnalyticsContextValue = {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  window: string;
  setWindow: (w: string) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  refresh: () => Promise<void>;
  /** Unix ms of last successful fetch — consumers can check freshness */
  lastFetchedAt: number;
};

const emptyData: AnalyticsData = {
  summary: { total_requests: 0, error_rate: 0, avg_latency: 0, total_bandwidth: 0 },
  request_rate: [],
  status_distribution: [],
  top_endpoints: [],
  latency_trend: [],
  latency_distribution: [],
  server_distribution: [],
  system_metrics: [],
  connections_history: [],
  http_status_metrics: null,
  gateway_metrics: [],
  insights: [],
  recent_requests: [],
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  data: null,
  loading: false,
  error: null,
  window: "1h",
  setWindow: () => {},
  agentId: "all",
  setAgentId: () => {},
  refresh: async () => {},
  lastFetchedAt: 0,
});

/**
 * Shared analytics provider. Fetches once, shared by Dashboard, Monitoring, and Analytics pages.
 * Avoids duplicate API calls when multiple pages are mounted or when navigating quickly.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState("1h");
  const [agentId, setAgentId] = useState("all");
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const fetchRef = useRef(0); // de-duplicate concurrent fetches

  const refresh = useCallback(async () => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);
    try {
      const agentParam = agentId && agentId !== "all" ? `&agent_id=${agentId}` : "";
      const res = await apiFetch(`/api/analytics?window=${window}${agentParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Only apply if this is still the latest fetch
      if (id === fetchRef.current) {
        setData({ ...emptyData, ...json, summary: { ...emptyData.summary, ...json.summary } });
        setLastFetchedAt(Date.now());
      }
    } catch (err: unknown) {
      if (id === fetchRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch analytics");
      }
    } finally {
      if (id === fetchRef.current) {
        setLoading(false);
      }
    }
  }, [window, agentId]);

  // Auto-fetch on window/agent change
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AnalyticsContext.Provider value={{ data, loading, error, window, setWindow, agentId, setAgentId, refresh, lastFetchedAt }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/** Hook to consume shared analytics data. */
export function useAnalytics() {
  return useContext(AnalyticsContext);
}
