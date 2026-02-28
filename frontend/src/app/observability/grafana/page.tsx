"use client";

import { useState, useEffect } from "react";
import { 
    LineChart, Activity, AlertTriangle, Clock, Server,
    Maximize2, Minimize2, RefreshCw, ExternalLink
} from "lucide-react";

interface GrafanaDashboard {
    id: string;
    uid: string;
    title: string;
    description: string;
    icon: React.ReactNode;
}

const GRAFANA_DASHBOARDS: GrafanaDashboard[] = [
    {
        id: "overview",
        uid: "avika-nginx-overview",
        title: "NGINX Overview",
        description: "Fleet-wide metrics, RPS, connections, and status codes",
        icon: <Activity className="h-4 w-4" />,
    },
    {
        id: "errors",
        uid: "avika-error-analysis",
        title: "Error Analysis",
        description: "4xx/5xx errors, error rates, and affected endpoints",
        icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
        id: "latency",
        uid: "avika-latency-analysis",
        title: "Latency Analysis",
        description: "Response times, percentiles, and slow requests",
        icon: <Clock className="h-4 w-4" />,
    },
    {
        id: "agent",
        uid: "avika-agent-detail",
        title: "Agent Detail",
        description: "Per-agent metrics, system resources, and logs",
        icon: <Server className="h-4 w-4" />,
    },
];

const TIME_RANGES = [
    { label: "Last 15m", value: "now-15m" },
    { label: "Last 1h", value: "now-1h" },
    { label: "Last 6h", value: "now-6h" },
    { label: "Last 24h", value: "now-24h" },
    { label: "Last 7d", value: "now-7d" },
];

const REFRESH_INTERVALS = [
    { label: "Off", value: "" },
    { label: "5s", value: "5s" },
    { label: "10s", value: "10s" },
    { label: "30s", value: "30s" },
    { label: "1m", value: "1m" },
    { label: "5m", value: "5m" },
];

export default function GrafanaPage() {
    const [selectedDashboard, setSelectedDashboard] = useState(GRAFANA_DASHBOARDS[0]);
    const [timeRange, setTimeRange] = useState("now-1h");
    const [refresh, setRefresh] = useState("30s");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [grafanaUrl, setGrafanaUrl] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const url = process.env.NEXT_PUBLIC_GRAFANA_URL || "";
        if (!url) {
            setError("Grafana URL not configured. Set NEXT_PUBLIC_GRAFANA_URL environment variable.");
        } else {
            setGrafanaUrl(url);
            setError(null);
        }
        setIsLoading(false);
    }, []);

    const buildIframeUrl = (dashboard: GrafanaDashboard) => {
        if (!grafanaUrl) return "";
        
        const params = new URLSearchParams({
            orgId: "1",
            from: timeRange,
            to: "now",
            timezone: "browser",
            kiosk: "tv",
        });
        
        if (refresh) {
            params.set("refresh", refresh);
        }

        return `${grafanaUrl}/d/${dashboard.uid}/${dashboard.uid}?${params.toString()}`;
    };

    const handleRefreshClick = () => {
        setIsLoading(true);
        setTimeout(() => setIsLoading(false), 100);
    };

    const openInNewTab = () => {
        const url = buildIframeUrl(selectedDashboard).replace("&kiosk=tv", "");
        window.open(url, "_blank");
    };

    if (error) {
        return (
            <div className="h-full flex items-center justify-center">
                <div 
                    className="max-w-md p-6 rounded-xl border text-center"
                    style={{
                        background: "rgb(var(--theme-surface))",
                        borderColor: "rgb(var(--theme-border))"
                    }}
                >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: "rgb(var(--theme-text))" }}>
                        Grafana Not Configured
                    </h2>
                    <p className="text-sm mb-4" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {error}
                    </p>
                    <code 
                        className="block p-3 rounded-lg text-xs text-left overflow-x-auto"
                        style={{ 
                            background: "rgb(var(--theme-background))",
                            color: "rgb(var(--theme-text-muted))"
                        }}
                    >
                        NEXT_PUBLIC_GRAFANA_URL=http://grafana.example.com
                    </code>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'h-[calc(100vh-8rem)]'}`}>
            {/* Header */}
            <div 
                className="flex items-center justify-between p-4 border-b flex-shrink-0"
                style={{
                    background: isFullscreen ? "#0a0a0a" : "rgb(var(--theme-surface))",
                    borderColor: "rgb(var(--theme-border))"
                }}
            >
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <LineChart className="h-5 w-5 text-purple-500" />
                        <h1 className="text-lg font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
                            Grafana Dashboards
                        </h1>
                    </div>
                    
                    {/* Dashboard Tabs */}
                    <div className="flex items-center gap-1 ml-4">
                        {GRAFANA_DASHBOARDS.map((dash) => (
                            <button
                                key={dash.id}
                                onClick={() => setSelectedDashboard(dash)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    selectedDashboard.id === dash.id 
                                        ? 'bg-purple-500/20 text-purple-400' 
                                        : 'hover:bg-white/5'
                                }`}
                                style={{ 
                                    color: selectedDashboard.id === dash.id 
                                        ? undefined 
                                        : "rgb(var(--theme-text-muted))" 
                                }}
                                title={dash.description}
                            >
                                {dash.icon}
                                <span className="hidden lg:inline">{dash.title}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    {/* Time Range */}
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        style={{
                            background: "rgb(var(--theme-background))",
                            borderColor: "rgb(var(--theme-border))",
                            color: "rgb(var(--theme-text))"
                        }}
                    >
                        {TIME_RANGES.map((range) => (
                            <option key={range.value} value={range.value}>
                                {range.label}
                            </option>
                        ))}
                    </select>

                    {/* Refresh Interval */}
                    <select
                        value={refresh}
                        onChange={(e) => setRefresh(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        style={{
                            background: "rgb(var(--theme-background))",
                            borderColor: "rgb(var(--theme-border))",
                            color: "rgb(var(--theme-text))"
                        }}
                    >
                        {REFRESH_INTERVALS.map((interval) => (
                            <option key={interval.value} value={interval.value}>
                                {interval.label}
                            </option>
                        ))}
                    </select>

                    {/* Refresh Button */}
                    <button
                        onClick={handleRefreshClick}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: "rgb(var(--theme-text-muted))" }}
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Open in New Tab */}
                    <button
                        onClick={openInNewTab}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: "rgb(var(--theme-text-muted))" }}
                        title="Open in Grafana"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </button>

                    {/* Fullscreen Toggle */}
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: "rgb(var(--theme-text-muted))" }}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? (
                            <Minimize2 className="h-4 w-4" />
                        ) : (
                            <Maximize2 className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Dashboard Description */}
            {!isFullscreen && (
                <div 
                    className="px-4 py-2 border-b flex-shrink-0"
                    style={{
                        background: "rgb(var(--theme-surface))",
                        borderColor: "rgb(var(--theme-border))"
                    }}
                >
                    <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {selectedDashboard.description}
                    </p>
                </div>
            )}

            {/* Iframe Container */}
            <div className="flex-1 relative">
                {isLoading && (
                    <div 
                        className="absolute inset-0 flex items-center justify-center z-10"
                        style={{ background: "rgb(var(--theme-background))" }}
                    >
                        <div className="flex items-center gap-3">
                            <RefreshCw className="h-6 w-6 animate-spin text-purple-500" />
                            <span style={{ color: "rgb(var(--theme-text-muted))" }}>
                                Loading dashboard...
                            </span>
                        </div>
                    </div>
                )}
                
                {grafanaUrl && (
                    <iframe
                        key={`${selectedDashboard.uid}-${timeRange}-${refresh}`}
                        src={buildIframeUrl(selectedDashboard)}
                        className="w-full h-full border-0"
                        onLoad={() => setIsLoading(false)}
                        allow="fullscreen"
                        title={`Grafana - ${selectedDashboard.title}`}
                    />
                )}
            </div>
        </div>
    );
}
