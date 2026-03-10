"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import React from "react";

// Map specific path segments to user-friendly names
const routeLabels: Record<string, string> = {
    settings: "Settings",
    integrations: "Integrations",
    teams: "Teams",
    projects: "Projects",
    llm: "LLM Configuration",
    waf: "WAF Policies",
    system: "System Health",
    monitoring: "Monitoring",
    inventory: "Inventory",
    provisions: "Provisions",
    analytics: "Analytics",
    geo: "Geo Analytics",
    traces: "Traces",
    visitors: "Visitor Analytics",
    observability: "Observability",
    grafana: "Grafana",
    alerts: "Alerts",
    optimization: "AI Tuner",
    reports: "Reports",
    audit: "Audit Logs",
    agents: "Agents",
    config: "Configuration",
    servers: "Servers"
};

const formatSegment = (segment: string) => {
    // Check if it's a known static route segment
    if (routeLabels[segment.toLowerCase()]) {
        return routeLabels[segment.toLowerCase()];
    }

    // Check if it looks like an ID (UUID, numeric, or alphanumeric hash)
    if (segment.length >= 8 && /^[0-9a-fA-F-]+$/.test(segment) || /^\d+$/.test(segment)) {
        return `ID: ${segment.substring(0, 8)}`; // Truncate long IDs
    }

    // Fallback: Capitalize first letter and replace hyphens
    return segment
        .replace(/-/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());
};

export function Breadcrumb() {
    const pathname = usePathname() ?? "";

    // Don't show breadcrumb on home or generic root pages
    if (!pathname || pathname === "/") return null;

    const segments = pathname.split('/').filter(Boolean);

    return (
        <nav aria-label="Breadcrumb" className="flex items-center text-sm">
            <Link
                href="/"
                className="hover:underline flex items-center gap-1 transition-colors"
                style={{ color: "rgb(var(--theme-text-muted))" }}
                title="Home"
            >
                <Home className="h-4 w-4" />
                <span className="sr-only">Home</span>
            </Link>

            {segments.map((segment, index) => {
                const isLast = index === segments.length - 1;
                const path = `/${segments.slice(0, index + 1).join('/')}`;

                return (
                    <React.Fragment key={path}>
                        <ChevronRight
                            className="h-4 w-4 mx-1 flex-shrink-0"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            aria-hidden="true"
                        />
                        {isLast ? (
                            <span
                                style={{ color: "rgb(var(--theme-text))" }}
                                className="font-medium truncate max-w-[200px]"
                                aria-current="page"
                            >
                                {formatSegment(segment)}
                            </span>
                        ) : (
                            <Link
                                href={path}
                                className="hover:underline hover:text-blue-500 transition-colors truncate max-w-[150px]"
                                style={{ color: "rgb(var(--theme-text-muted))" }}
                            >
                                {formatSegment(segment)}
                            </Link>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
