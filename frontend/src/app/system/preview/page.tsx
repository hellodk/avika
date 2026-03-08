"use client";

/**
 * System Dashboard — UX Redesign Preview
 *
 * This is a MOCKUP with static data to evaluate the proposed layout before implementation.
 * Compare with /system (current) to decide whether to adopt this design.
 *
 * Design goals: scanability <3s, operational state first, minimal noise, progressive disclosure.
 * See docs/UX-REDESIGN-SYSTEM-DASHBOARD.md for full plan and observations.
 */

import Link from "next/link";
import { RefreshCw } from "lucide-react";

// Mock data for preview
const MOCK_INFRA = [
  { name: "API Gateway", status: "healthy" as const },
  { name: "PostgreSQL", status: "healthy" as const },
  { name: "ClickHouse", status: "healthy" as const },
  { name: "Agent Network", status: "healthy" as const, detail: "8 nodes" },
];

const MOCK_AGENTS = [
  { id: "1", hostname: "nginx-alpha-dev", isPod: true, status: "online" as const, version: "1.7.0", lastSeen: "2s", needsUpdate: false },
  { id: "2", hostname: "nginx-beta-uat", isPod: true, status: "online" as const, version: "1.7.0", lastSeen: "1s", needsUpdate: false },
  { id: "3", hostname: "nginx-sidecar", isPod: true, status: "online" as const, version: "0.19.1", lastSeen: "3s", needsUpdate: true },
  { id: "4", hostname: "nginx-edge", isPod: false, status: "online" as const, version: "1.6.8", lastSeen: "1s", needsUpdate: false },
];

const MOCK_EVENTS = [
  { time: "12:41", msg: "nginx-beta-uat connected" },
  { time: "12:38", msg: "nginx-sidecar update available" },
  { time: "12:36", msg: "nginx-alpha-dev heartbeat" },
];

function StatusDot({ status }: { status: "healthy" | "degraded" | "critical" | "unknown" | "online" | "offline" }) {
  const map: Record<string, { bg: string; label: string }> = {
    healthy: { bg: "bg-emerald-400", label: "Healthy" },
    online: { bg: "bg-emerald-400", label: "Online" },
    degraded: { bg: "bg-amber-400", label: "Degraded" },
    critical: { bg: "bg-red-400", label: "Critical" },
    offline: { bg: "bg-red-400", label: "Offline" },
    unknown: { bg: "bg-slate-400", label: "Unknown" },
  };
  const { bg, label } = map[status] || map.unknown;
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      <span className={`h-2.5 w-2.5 rounded-full ${bg}`} aria-hidden />
      <span className="text-sm font-medium capitalize">{label}</span>
    </span>
  );
}

function StatusRowAgent({ status, needsUpdate }: { status: string; needsUpdate?: boolean }) {
  if (needsUpdate)
    return (
      <span className="inline-flex items-center gap-1.5" role="status">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden />
        <span className="text-sm font-medium text-amber-400">Update</span>
      </span>
    );
  const isOnline = status === "online";
  return (
    <span className="inline-flex items-center gap-1.5" role="status">
      <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-red-400"}`} aria-hidden />
      <span className={`text-sm font-medium ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
        {isOnline ? "Online" : "Offline"}
      </span>
    </span>
  );
}

export default function SystemPreviewPage() {
  return (
    <div className="space-y-6 pb-8">
      {/* Banner: this is a preview */}
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
        style={{ color: "rgb(var(--theme-text))" }}
      >
        <strong>Preview:</strong> This is the proposed System dashboard layout (mock data).{" "}
        <Link href="/system" className="underline hover:no-underline">
          View current System page
        </Link>
        {" · "}
        <span title="See docs/UX-REDESIGN-SYSTEM-DASHBOARD.md in the repo">Redesign plan (docs)</span>
      </div>

      {/* Page title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
            System Overview
          </h1>
        </div>
      </div>

      {/* ─── SYSTEM HEALTH (inline metrics, no cards) ─── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgb(var(--theme-text-muted))" }}>
          System Health
        </h2>
        <div
          className="flex flex-wrap items-baseline gap-6 py-4 px-4 rounded-lg"
          style={{ background: "rgb(var(--theme-surface))" }}
        >
          <div>
            <span className="text-[28px] font-bold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>
              8 / 8
            </span>
            <span className="ml-2 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
              Agents
            </span>
          </div>
          <div>
            <span className="text-[28px] font-bold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>
              100%
            </span>
            <span className="ml-2 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
              Uptime
            </span>
          </div>
          <div>
            <span className="text-[28px] font-bold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>
              v1.7.0
            </span>
            <span className="ml-2 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
              Version
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:opacity-90"
              style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Two-column: Infrastructure | Agent Fleet */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Infrastructure */}
        <section className="lg:col-span-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Infrastructure
          </h2>
          <div
            className="rounded-lg py-2"
            style={{ background: "rgb(var(--theme-surface))" }}
          >
            {MOCK_INFRA.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                style={{ borderColor: "rgb(var(--theme-border))" }}
              >
                <span className="text-sm font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                  {item.name}
                </span>
                <div className="flex items-center gap-2">
                  <StatusDot status={item.status} />
                  {item.detail && (
                    <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                      {item.detail}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Micro metrics (optional) */}
          <h2 className="text-xs font-semibold uppercase tracking-wider mt-6 mb-3" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Traffic
          </h2>
          <div
            className="rounded-lg px-4 py-3 grid grid-cols-3 gap-4 text-center"
            style={{ background: "rgb(var(--theme-surface))" }}
          >
            <div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>284</div>
              <div className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>req/s</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>0.03%</div>
              <div className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>errors</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>18ms</div>
              <div className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>p95</div>
            </div>
          </div>
        </section>

        {/* Right: Agent Fleet */}
        <section className="lg:col-span-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Agent Fleet
          </h2>
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "rgb(var(--theme-surface))" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderColor: "rgb(var(--theme-border))" }} className="border-b">
                  <th className="text-left py-3 px-4 font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Agent
                  </th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Version
                  </th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: "rgb(var(--theme-text-muted))" }}>
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_AGENTS.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b last:border-b-0 hover:bg-white/5"
                    style={{ borderColor: "rgb(var(--theme-border))" }}
                  >
                    <td className="py-3 px-4">
                      <Link
                        href={`/servers/${encodeURIComponent(agent.id)}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                        style={{ color: "rgb(var(--theme-text))" }}
                      >
                        <span className="text-base" aria-label={agent.isPod ? "Kubernetes Pod" : "VM"}>
                          {agent.isPod ? "⎈" : "🖥"}
                        </span>
                        {agent.hostname}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <StatusRowAgent status={agent.status} needsUpdate={agent.needsUpdate} />
                    </td>
                    <td className="py-3 px-4 tabular-nums" style={{ color: "rgb(var(--theme-text))" }}>
                      {agent.version}
                    </td>
                    <td className="py-3 px-4 tabular-nums" style={{ color: "rgb(var(--theme-text-muted))" }}>
                      {agent.lastSeen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent events (optional) */}
          <h2 className="text-xs font-semibold uppercase tracking-wider mt-6 mb-3" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Recent Events
          </h2>
          <div
            className="rounded-lg px-4 py-3 space-y-2"
            style={{ background: "rgb(var(--theme-surface))" }}
          >
            {MOCK_EVENTS.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="tabular-nums font-mono text-xs w-10" style={{ color: "rgb(var(--theme-text-muted))" }}>
                  {ev.time}
                </span>
                <span style={{ color: "rgb(var(--theme-text))" }}>{ev.msg}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
