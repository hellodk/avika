"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, LayoutDashboard, Heart, Cpu, BarChart2, Users, ShieldAlert, FileText, Server, Layers, Zap, ShieldCheck, Settings, Globe, Lock } from "lucide-react";
import { apiFetch, serverIdForDisplay } from "@/lib/api";
import { filterAndSortByFuzzy } from "@/lib/search-fuzzy";

// Static pages (from nav + extras)
const PAGES: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/system", label: "System Health" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/analytics", label: "Analytics" },
  { href: "/analytics/visitors", label: "Visitor Analytics" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/inventory", label: "Inventory" },
  { href: "/provisions", label: "Provisions" },
  { href: "/optimization", label: "AI Tuner" },
  { href: "/audit", label: "Audit Logs" },
  { href: "/settings", label: "Settings" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/security", label: "Security" },
];

// Settings keywords -> /settings?q=
const SETTINGS_KEYWORDS: { label: string; q: string }[] = [
  { label: "Prometheus", q: "prometheus" },
  { label: "Grafana", q: "grafana" },
  { label: "ClickHouse", q: "clickhouse" },
  { label: "PostgreSQL", q: "postgres" },
  { label: "Display", q: "display" },
  { label: "LLM", q: "llm" },
  { label: "WAF", q: "waf" },
];

type SuggestionType = "page" | "settings" | "instance";

interface PageSuggestion {
  type: "page";
  href: string;
  label: string;
}

interface SettingsSuggestion {
  type: "settings";
  label: string;
  q: string;
}

interface InstanceSuggestion {
  type: "instance";
  agent_id: string;
  hostname: string;
  ip?: string;
}

type Suggestion = PageSuggestion | SettingsSuggestion | InstanceSuggestion;

function getSuggestionLabel(s: Suggestion): string {
  if (s.type === "page") return s.label;
  if (s.type === "settings") return s.label;
  return s.hostname || (s.agent_id ? serverIdForDisplay(s.agent_id) : "") || s.ip || s.agent_id || "";
}

function getSuggestionHref(s: Suggestion): string {
  if (s.type === "page") return s.href;
  if (s.type === "settings") return `/settings?q=${encodeURIComponent(s.q)}`;
  // Link directly to server detail with normalized ID (no + or dots in URL)
  const base = typeof window !== "undefined" && window.location.pathname.startsWith("/avika") ? "/avika" : "";
  return `${base}/servers/${encodeURIComponent(serverIdForDisplay(s.agent_id || ""))}`;
}

const PAGE_ICONS: Record<string, React.ReactNode> = {
  "/": <LayoutDashboard className="h-4 w-4 shrink-0" />,
  "/system": <Heart className="h-4 w-4 shrink-0" />,
  "/monitoring": <Cpu className="h-4 w-4 shrink-0" />,
  "/analytics": <BarChart2 className="h-4 w-4 shrink-0" />,
  "/analytics/visitors": <Users className="h-4 w-4 shrink-0" />,
  "/alerts": <ShieldAlert className="h-4 w-4 shrink-0" />,
  "/reports": <FileText className="h-4 w-4 shrink-0" />,
  "/inventory": <Server className="h-4 w-4 shrink-0" />,
  "/provisions": <Layers className="h-4 w-4 shrink-0" />,
  "/optimization": <Zap className="h-4 w-4 shrink-0" />,
  "/audit": <ShieldCheck className="h-4 w-4 shrink-0" />,
  "/settings": <Settings className="h-4 w-4 shrink-0" />,
  "/settings/integrations": <Globe className="h-4 w-4 shrink-0" />,
  "/settings/security": <Lock className="h-4 w-4 shrink-0" />,
};

interface GlobalSearchProps {
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
}

export function GlobalSearch({ onOpenChange, "aria-label": ariaLabel }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [instances, setInstances] = useState<InstanceSuggestion[]>([]);
  const [instancesFetched, setInstancesFetched] = useState(false);

  const fetchInstances = useCallback(async () => {
    if (instancesFetched) return;
    setInstancesFetched(true);
    try {
      const res = await apiFetch("/api/servers");
      if (!res.ok) return;
      const data = await res.json();
      const agents = Array.isArray(data.agents) ? data.agents : [];
      setInstances(
        agents.map((a: { agent_id?: string; hostname?: string; ip?: string }) => ({
          type: "instance" as const,
          agent_id: a.agent_id || "",
          hostname: a.hostname || "",
          ip: a.ip,
        }))
      );
    } catch {
      // ignore
    }
  }, [instancesFetched]);

  const filteredPages = filterAndSortByFuzzy(PAGES, query, (p) => p.label);
  const filteredSettings = filterAndSortByFuzzy(SETTINGS_KEYWORDS, query, (s) => [s.label, s.q]);
  const filteredInstances = filterAndSortByFuzzy(instances, query, (i) => [
    i.hostname,
    i.agent_id,
    i.ip || "",
  ]);

  const hasQuery = query.trim().length >= 1;
  const allSuggestions: Suggestion[] = hasQuery
    ? [
        ...filteredPages.map((p) => ({ type: "page" as const, href: p.href, label: p.label })),
        ...filteredSettings.map((s) => ({ type: "settings" as const, label: s.label, q: s.q })),
        ...filteredInstances,
      ].slice(0, 12)
    : PAGES.slice(0, 8).map((p) => ({ type: "page" as const, href: p.href, label: p.label }));

  const showPanel = open;

  useEffect(() => {
    if (open) fetchInstances();
  }, [open, fetchInstances]);

  useEffect(() => {
    // Esc is still handled by panel
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!showPanel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(1, allSuggestions.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + allSuggestions.length) % Math.max(1, allSuggestions.length));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPanel, allSuggestions.length]);

  const handleSelect = useCallback(
    (suggestion: Suggestion) => {
      const href = getSuggestionHref(suggestion);
      setQuery("");
      setOpen(false);
      onOpenChange?.(false);
      router.push(href);
      inputRef.current?.blur();
    },
    [router, onOpenChange]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (allSuggestions.length > 0 && activeIndex < allSuggestions.length) {
      handleSelect(allSuggestions[activeIndex]);
      return;
    }
    if (q) {
      setQuery("");
      setOpen(false);
      onOpenChange?.(false);
      router.push(`/inventory?q=${encodeURIComponent(q)}`);
    }
    inputRef.current?.blur();
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (panelRef.current?.contains(document.activeElement)) return;
      setOpen(false);
      onOpenChange?.(false);
    }, 150);
  };

  return (
    <div className="relative flex items-stretch gap-0 shrink-0">
      <form onSubmit={handleSubmit} className="flex items-stretch gap-0">
        <div
          className="relative flex items-center h-9 rounded-l-md border"
          style={{
            borderColor: "rgb(var(--theme-border))",
            background: "rgb(var(--theme-background))",
          }}
        >
          <Search
            className="absolute left-3 h-4 w-4 pointer-events-none"
            style={{ color: "rgb(var(--theme-text-muted))" }}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              onOpenChange?.(true);
            }}
            onFocus={() => {
              setOpen(true);
              onOpenChange?.(true);
            }}
            onBlur={handleBlur}
            placeholder="Search instances, pages, settings…"
            className="h-full w-56 min-w-0 pl-9 pr-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0"
            style={{ color: "rgb(var(--theme-text))" }}
            aria-label={ariaLabel ?? "Search instances, pages, settings"}
            aria-expanded={showPanel}
            aria-autocomplete="list"
            aria-controls="global-search-listbox"
            aria-activedescendant={showPanel && allSuggestions[activeIndex] ? `search-option-${activeIndex}` : undefined}
          />
        </div>
        <button
          type="submit"
          className="flex items-center justify-center h-9 w-9 rounded-r-md border border-l-0 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-inset hover:opacity-90"
          style={{
            background: "rgb(var(--theme-surface))",
            borderColor: "rgb(var(--theme-border))",
            color: "rgb(var(--theme-text-muted))",
          }}
          aria-label="Search"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      {showPanel && (
        <div
          ref={panelRef}
          id="global-search-listbox"
          role="listbox"
          className="absolute top-full left-0 mt-1 w-[min(100%,theme(maxWidth.2xl))] max-h-80 overflow-auto rounded-md border shadow-lg z-[100] py-1"
          style={{
            background: "rgb(var(--theme-surface))",
            borderColor: "rgb(var(--theme-border))",
          }}
        >
          {allSuggestions.length === 0 ? (
            <div className="px-3 py-4 text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
              No results. Press Enter to search Inventory.
            </div>
          ) : (
            allSuggestions.map((suggestion, i) => {
              const label = getSuggestionLabel(suggestion);
              const isActive = i === activeIndex;
              const icon =
                suggestion.type === "page"
                  ? PAGE_ICONS[suggestion.href] ?? <Settings className="h-4 w-4 shrink-0" />
                  : suggestion.type === "settings"
                    ? <Settings className="h-4 w-4 shrink-0" />
                    : <Server className="h-4 w-4 shrink-0" />;
              return (
                <button
                  key={
                    suggestion.type === "instance"
                      ? suggestion.agent_id
                      : suggestion.type === "page"
                        ? suggestion.href
                        : `settings-${suggestion.q}`
                  }
                  id={`search-option-${i}`}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm focus:outline-none"
                  style={{
                    background: isActive ? "rgb(var(--theme-background))" : "transparent",
                    color: "rgb(var(--theme-text))",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(suggestion);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span style={{ color: "rgb(var(--theme-text-muted))" }}>{icon}</span>
                  <span className="truncate">{label}</span>
                  {suggestion.type === "instance" && suggestion.ip && (
                    <span className="ml-auto text-xs truncate max-w-[120px]" style={{ color: "rgb(var(--theme-text-muted))" }}>
                      {suggestion.ip}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
