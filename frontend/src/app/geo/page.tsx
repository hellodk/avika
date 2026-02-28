'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Globe, MapPin, Activity, Users, Flag, TrendingUp, 
    RefreshCw, Loader2, AlertTriangle, Building2, Wifi,
    ZoomIn, ZoomOut, RotateCcw, Search, Clock, CheckCircle2,
    XCircle, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown,
    Copy, Download, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme-provider';
import { getChartColorsForTheme } from '@/lib/chart-colors';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, 
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ReferenceLine
} from 'recharts';
import { 
    ComposableMap, 
    Geographies, 
    Geography, 
    Marker, 
    ZoomableGroup 
} from 'react-simple-maps';

interface GeoLocation {
    country: string;
    country_code: string;
    city: string;
    latitude: number;
    longitude: number;
    requests: number;
    errors: number;
    avg_latency: number;
    p50_latency?: number;
    p95_latency?: number;
    p99_latency?: number;
}

interface CountryStat {
    country: string;
    country_code: string;
    requests: number;
    errors: number;
    bandwidth: number;
    error_rate: number;
}

interface CityStat {
    city: string;
    country: string;
    country_code: string;
    latitude: number;
    longitude: number;
    requests: number;
}

interface GeoRequest {
    timestamp: number;
    client_ip: string;
    country: string;
    country_code: string;
    city: string;
    latitude: number;
    longitude: number;
    method: string;
    uri: string;
    status: number;
    latency_ms?: number;
}

interface GeoData {
    locations: GeoLocation[];
    country_stats: CountryStat[];
    city_stats: CityStat[];
    recent_requests: GeoRequest[];
    total_countries: number;
    total_cities: number;
    total_requests: number;
    top_country_code: string;
}

const GEO_URL = "/world-110m.json";

// SLO thresholds
const ERROR_RATE_WARNING = 1; // 1%
const ERROR_RATE_CRITICAL = 5; // 5%
const LATENCY_WARNING = 200; // 200ms
const LATENCY_CRITICAL = 500; // 500ms

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toISOString().substring(11, 23); // HH:mm:ss.SSS
}

function formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
}

type StatusLevel = 'healthy' | 'warning' | 'critical';

function getStatusLevel(errorRate: number): StatusLevel {
    if (errorRate > 0.1) return 'critical';
    if (errorRate > 0.05) return 'warning';
    return 'healthy';
}

function getStatusColor(level: StatusLevel, chartColors: ReturnType<typeof getChartColorsForTheme>): string {
    switch (level) {
        case 'critical': return chartColors.error;
        case 'warning': return chartColors.warning;
        default: return chartColors.success;
    }
}

function getStatusIcon(level: StatusLevel): React.ReactNode {
    switch (level) {
        case 'critical': return <XCircle className="h-3 w-3" aria-hidden="true" />;
        case 'warning': return <AlertCircle className="h-3 w-3" aria-hidden="true" />;
        default: return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
    }
}

function getStatusLabel(level: StatusLevel): string {
    switch (level) {
        case 'critical': return 'Critical - Error rate above 10%';
        case 'warning': return 'Warning - Error rate between 5-10%';
        default: return 'Healthy - Error rate below 5%';
    }
}

// Marker shape path for different statuses (accessibility - not color-only)
function getMarkerShape(level: StatusLevel): string {
    switch (level) {
        case 'critical': return 'diamond'; // Diamond for critical
        case 'warning': return 'triangle'; // Triangle for warning
        default: return 'circle'; // Circle for healthy
    }
}

interface DataFreshnessIndicatorProps {
    lastUpdated: number | null;
    isRefreshing: boolean;
    hasError: boolean;
    onRetry: () => void;
}

const DataFreshnessIndicator: React.FC<DataFreshnessIndicatorProps> = ({
    lastUpdated,
    isRefreshing,
    hasError,
    onRetry
}) => {
    const [now, setNow] = useState(Date.now());
    
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);
    
    const staleness = lastUpdated ? now - lastUpdated : null;
    const isStale = staleness && staleness > 60000; // >60 seconds is stale
    
    return (
        <div 
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
            style={{ 
                background: hasError 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : isStale 
                        ? 'rgba(245, 158, 11, 0.15)' 
                        : 'rgba(34, 197, 94, 0.15)',
                color: hasError 
                    ? 'rgb(239, 68, 68)' 
                    : isStale 
                        ? 'rgb(245, 158, 11)' 
                        : 'rgb(34, 197, 94)'
            }}
            role="status"
            aria-live="polite"
            aria-label={
                hasError 
                    ? 'Data refresh failed' 
                    : isStale 
                        ? 'Data may be stale' 
                        : 'Data is current'
            }
        >
            {isRefreshing ? (
                <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    <span>Refreshing...</span>
                </>
            ) : hasError ? (
                <>
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    <span>Refresh failed</span>
                    <button 
                        onClick={onRetry}
                        className="underline hover:no-underline ml-1"
                        aria-label="Retry data refresh"
                    >
                        Retry
                    </button>
                </>
            ) : (
                <>
                    <div 
                        className={`w-2 h-2 rounded-full ${isStale ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ animation: isStale ? 'none' : 'pulse 2s infinite' }}
                        aria-hidden="true"
                    />
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>
                        {lastUpdated ? formatTimeAgo(staleness!) : 'Never updated'}
                    </span>
                    {isStale && (
                        <span className="font-medium">(stale)</span>
                    )}
                </>
            )}
        </div>
    );
};

interface MapTooltipProps {
    content: {
        city: string;
        country: string;
        requests: number;
        errors: number;
        avgLatency: number;
        p50Latency?: number;
        p95Latency?: number;
        p99Latency?: number;
        statusLevel: StatusLevel;
    } | null;
    position: { x: number; y: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

const MapTooltip: React.FC<MapTooltipProps> = ({ content, position, containerRef }) => {
    if (!content) return null;
    
    const errorRate = content.errors / Math.max(content.requests, 1) * 100;
    
    // Calculate position to prevent viewport overflow
    const tooltipWidth = 220;
    const tooltipHeight = 160;
    const container = containerRef.current;
    const containerRect = container?.getBoundingClientRect();
    
    let left = position.x + 10;
    let top = position.y - 60;
    
    if (containerRect) {
        // Adjust horizontal position if would overflow right edge
        if (position.x + tooltipWidth + 20 > containerRect.right) {
            left = position.x - tooltipWidth - 10;
        }
        // Adjust vertical position if would overflow top
        if (position.y - tooltipHeight < containerRect.top) {
            top = position.y + 20;
        }
        // Adjust if would overflow bottom
        if (top + tooltipHeight > containerRect.bottom) {
            top = containerRect.bottom - tooltipHeight - 10;
        }
    }
    
    return (
        <div 
            className="absolute pointer-events-none z-50 px-3 py-2 rounded-lg shadow-lg text-sm"
            style={{ 
                left,
                top,
                width: tooltipWidth,
                background: 'rgb(var(--theme-surface))',
                border: '1px solid rgb(var(--theme-border))',
                color: 'rgb(var(--theme-text))'
            }}
            role="tooltip"
        >
            <div className="font-semibold flex items-center gap-2">
                {getStatusIcon(content.statusLevel)}
                {content.city}, {content.country}
            </div>
            <div className="mt-1 space-y-0.5 text-xs" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                <div className="flex justify-between gap-4">
                    <span>Requests:</span>
                    <span className="font-medium" style={{ color: 'rgb(var(--theme-text))' }}>
                        {formatNumber(content.requests)}
                    </span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Errors:</span>
                    <span className={`font-medium ${errorRate > 5 ? 'text-red-500' : ''}`}>
                        {content.errors} ({errorRate.toFixed(1)}%)
                    </span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Avg Latency:</span>
                    <span className="font-medium" style={{ color: 'rgb(var(--theme-text))' }}>
                        {content.avgLatency.toFixed(1)}ms
                    </span>
                </div>
                {content.p95Latency && (
                    <div className="flex justify-between gap-4">
                        <span>p95 Latency:</span>
                        <span className={`font-medium ${content.p95Latency > LATENCY_WARNING ? 'text-yellow-500' : ''}`}>
                            {content.p95Latency.toFixed(1)}ms
                        </span>
                    </div>
                )}
                {content.p99Latency && (
                    <div className="flex justify-between gap-4">
                        <span>p99 Latency:</span>
                        <span className={`font-medium ${content.p99Latency > LATENCY_CRITICAL ? 'text-red-500' : ''}`}>
                            {content.p99Latency.toFixed(1)}ms
                        </span>
                    </div>
                )}
            </div>
            <div className="mt-2 pt-2 border-t text-xs" style={{ borderColor: 'rgb(var(--theme-border))' }}>
                <span style={{ color: 'rgb(var(--theme-text-muted))' }}>
                    Status: {getStatusLabel(content.statusLevel)}
                </span>
            </div>
        </div>
    );
};

interface WorldMapProps {
    locations: GeoLocation[];
    onLocationClick?: (location: GeoLocation) => void;
    selectedCountry?: string | null;
    chartColors: ReturnType<typeof getChartColorsForTheme>;
}

const WorldMap: React.FC<WorldMapProps> = ({ 
    locations, 
    onLocationClick,
    selectedCountry,
    chartColors
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ coordinates: [0, 20] as [number, number], zoom: 1 });
    const [tooltip, setTooltip] = useState<MapTooltipProps['content']>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    
    const maxRequests = Math.max(...locations.map(l => l.requests), 1);
    
    const handleZoomIn = () => {
        if (position.zoom >= 4) return;
        setPosition(pos => ({ ...pos, zoom: pos.zoom * 1.5 }));
    };
    
    const handleZoomOut = () => {
        if (position.zoom <= 1) return;
        setPosition(pos => ({ ...pos, zoom: pos.zoom / 1.5 }));
    };
    
    const handleReset = () => {
        setPosition({ coordinates: [0, 20], zoom: 1 });
    };
    
    const handleMoveEnd = (pos: { coordinates: [number, number]; zoom: number }) => {
        setPosition(pos);
    };
    
    // Keyboard navigation for accessibility
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (locations.length === 0) return;
        
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(prev => (prev + 1) % locations.length);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(prev => prev <= 0 ? locations.length - 1 : prev - 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < locations.length) {
                    onLocationClick?.(locations[focusedIndex]);
                }
                break;
            case 'Escape':
                setFocusedIndex(-1);
                setTooltip(null);
                break;
        }
    };
    
    // Update tooltip when focused marker changes
    useEffect(() => {
        if (focusedIndex >= 0 && focusedIndex < locations.length) {
            const loc = locations[focusedIndex];
            const errorRate = loc.errors / Math.max(loc.requests, 1);
            setTooltip({
                city: loc.city,
                country: loc.country,
                requests: loc.requests,
                errors: loc.errors,
                avgLatency: loc.avg_latency,
                p50Latency: loc.p50_latency,
                p95Latency: loc.p95_latency,
                p99Latency: loc.p99_latency,
                statusLevel: getStatusLevel(errorRate)
            });
        } else {
            setTooltip(null);
        }
    }, [focusedIndex, locations]);

    // Render marker based on status (shape changes for accessibility)
    const renderMarker = (loc: GeoLocation, idx: number, size: number, statusLevel: StatusLevel) => {
        const color = getStatusColor(statusLevel, chartColors);
        const isFocused = focusedIndex === idx;
        const shape = getMarkerShape(statusLevel);
        
        return (
            <g
                key={idx}
                onMouseEnter={(e) => {
                    setTooltip({
                        city: loc.city,
                        country: loc.country,
                        requests: loc.requests,
                        errors: loc.errors,
                        avgLatency: loc.avg_latency,
                        p50Latency: loc.p50_latency,
                        p95Latency: loc.p95_latency,
                        p99Latency: loc.p99_latency,
                        statusLevel
                    });
                    setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                    if (focusedIndex !== idx) setTooltip(null);
                }}
                onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                onClick={() => onLocationClick?.(loc)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={`${loc.city}, ${loc.country}: ${formatNumber(loc.requests)} requests, ${loc.errors} errors, ${getStatusLabel(statusLevel)}`}
                tabIndex={-1}
            >
                {/* Focus ring for keyboard navigation */}
                {isFocused && (
                    <circle
                        r={size * 2}
                        fill="none"
                        stroke={chartColors.info}
                        strokeWidth={2}
                        strokeDasharray="4 2"
                    />
                )}
                
                {/* Outer pulse - only for healthy/warning */}
                {statusLevel !== 'critical' && (
                    <circle
                        r={size * 1.5}
                        fill={color}
                        opacity={0.2}
                        className="animate-ping"
                    />
                )}
                
                {/* Middle glow */}
                <circle
                    r={size}
                    fill={color}
                    opacity={0.4}
                />
                
                {/* Inner shape based on status */}
                {shape === 'circle' && (
                    <circle
                        r={size * 0.6}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                    />
                )}
                {shape === 'triangle' && (
                    <polygon
                        points={`0,${-size * 0.7} ${size * 0.6},${size * 0.4} ${-size * 0.6},${size * 0.4}`}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                    />
                )}
                {shape === 'diamond' && (
                    <polygon
                        points={`0,${-size * 0.7} ${size * 0.5},0 0,${size * 0.7} ${-size * 0.5},0`}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                    />
                )}
                
                {/* Status icon overlay for critical/warning */}
                {statusLevel === 'critical' && (
                    <text
                        x={0}
                        y={size * 0.25}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={size * 0.8}
                        fontWeight="bold"
                    >
                        !
                    </text>
                )}
            </g>
        );
    };

    return (
        <div 
            ref={containerRef}
            className="relative w-full rounded-lg overflow-hidden" 
            style={{ background: 'rgb(var(--theme-background))' }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="application"
            aria-label="Interactive world map showing traffic distribution. Use arrow keys to navigate between locations, Enter to select."
        >
            {/* Skip link for accessibility */}
            <a 
                href="#geo-tabs"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:px-4 focus:py-2 focus:rounded focus:bg-blue-500 focus:text-white"
            >
                Skip map
            </a>
            
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleZoomIn}
                    disabled={position.zoom >= 4}
                    className="h-8 w-8 focus:ring-2 focus:ring-blue-500"
                    style={{ background: 'rgb(var(--theme-surface))' }}
                    aria-label="Zoom in"
                >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleZoomOut}
                    disabled={position.zoom <= 1}
                    className="h-8 w-8 focus:ring-2 focus:ring-blue-500"
                    style={{ background: 'rgb(var(--theme-surface))' }}
                    aria-label="Zoom out"
                >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleReset}
                    className="h-8 w-8 focus:ring-2 focus:ring-blue-500"
                    style={{ background: 'rgb(var(--theme-surface))' }}
                    aria-label="Reset map view"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
            
            {/* Map */}
            <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                    scale: 120,
                    center: [0, 20]
                }}
                style={{ width: '100%', height: 'auto', minHeight: '300px', maxHeight: '500px', aspectRatio: '2/1' }}
            >
                <ZoomableGroup
                    zoom={position.zoom}
                    center={position.coordinates}
                    onMoveEnd={handleMoveEnd}
                    minZoom={1}
                    maxZoom={4}
                >
                    <Geographies geography={GEO_URL}>
                        {({ geographies }) =>
                            geographies.map((geo) => (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    fill="rgb(var(--theme-surface))"
                                    stroke="rgb(var(--theme-border))"
                                    strokeWidth={0.5}
                                    style={{
                                        default: { outline: 'none' },
                                        hover: { 
                                            fill: 'rgb(var(--theme-primary) / 0.3)', 
                                            outline: 'none',
                                            cursor: 'pointer'
                                        },
                                        pressed: { outline: 'none' }
                                    }}
                                />
                            ))
                        }
                    </Geographies>
                    
                    {/* Location Markers */}
                    {locations.map((loc, idx) => {
                        const size = Math.max(4, Math.min(16, (loc.requests / maxRequests) * 12 + 4));
                        const errorRate = loc.errors / Math.max(loc.requests, 1);
                        const statusLevel = getStatusLevel(errorRate);
                        
                        return (
                            <Marker 
                                key={idx} 
                                coordinates={[loc.longitude, loc.latitude]}
                            >
                                {renderMarker(loc, idx, size, statusLevel)}
                            </Marker>
                        );
                    })}
                </ZoomableGroup>
            </ComposableMap>
            
            {/* Tooltip */}
            {tooltip && (
                <MapTooltip content={tooltip} position={tooltipPos} containerRef={containerRef} />
            )}
            
            {/* Legend with shapes for accessibility */}
            <div 
                className="absolute bottom-3 left-3 flex flex-col gap-2 text-xs px-3 py-2 rounded-lg" 
                style={{ 
                    background: 'rgb(var(--theme-surface))', 
                    color: 'rgb(var(--theme-text))',
                    border: '1px solid rgb(var(--theme-border))'
                }}
                role="img"
                aria-label="Map legend: Circle indicates healthy (less than 5% errors), Triangle indicates warning (5-10% errors), Diamond indicates critical (more than 10% errors)"
            >
                <div className="font-medium mb-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Legend</div>
                <div className="flex items-center gap-2">
                    <svg width="16" height="16" aria-hidden="true">
                        <circle cx="8" cy="8" r="5" fill={chartColors.success} />
                    </svg>
                    <CheckCircle2 className="h-3 w-3" style={{ color: chartColors.success }} aria-hidden="true" />
                    <span>Healthy (&lt;5% errors)</span>
                </div>
                <div className="flex items-center gap-2">
                    <svg width="16" height="16" aria-hidden="true">
                        <polygon points="8,2 14,14 2,14" fill={chartColors.warning} />
                    </svg>
                    <AlertCircle className="h-3 w-3" style={{ color: chartColors.warning }} aria-hidden="true" />
                    <span>Warning (5-10% errors)</span>
                </div>
                <div className="flex items-center gap-2">
                    <svg width="16" height="16" aria-hidden="true">
                        <polygon points="8,1 15,8 8,15 1,8" fill={chartColors.error} />
                    </svg>
                    <XCircle className="h-3 w-3" style={{ color: chartColors.error }} aria-hidden="true" />
                    <span>Critical (&gt;10% errors)</span>
                </div>
            </div>
            
            {/* Zoom indicator */}
            <div className="absolute bottom-3 right-3 text-xs px-2 py-1 rounded"
                 style={{ 
                     background: 'rgb(var(--theme-surface))', 
                     color: 'rgb(var(--theme-text-muted))',
                     border: '1px solid rgb(var(--theme-border))'
                 }}>
                {position.zoom.toFixed(1)}x
            </div>
            
            {/* Keyboard hint */}
            <div className="absolute top-3 left-3 text-xs px-2 py-1 rounded opacity-75"
                 style={{ 
                     background: 'rgb(var(--theme-surface))', 
                     color: 'rgb(var(--theme-text-muted))',
                     border: '1px solid rgb(var(--theme-border))'
                 }}>
                Press Tab then arrows to navigate
            </div>
        </div>
    );
};

const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    subtitle?: string;
    trend?: { value: number; isUp: boolean };
}> = ({ title, value, icon, subtitle }) => (
    <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                {title}
            </CardTitle>
            <div className="p-2 rounded-lg" style={{ background: 'rgba(var(--theme-primary), 0.1)' }}>
                {icon}
            </div>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'rgb(var(--theme-text))' }}>{value}</div>
            {subtitle && <p className="text-xs mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>{subtitle}</p>}
        </CardContent>
    </Card>
);

// Sortable table header component
type SortDirection = 'asc' | 'desc' | null;
interface SortConfig {
    key: string;
    direction: SortDirection;
}

const SortableHeader: React.FC<{
    label: string;
    sortKey: string;
    currentSort: SortConfig;
    onSort: (key: string) => void;
    className?: string;
}> = ({ label, sortKey, currentSort, onSort, className }) => {
    const isActive = currentSort.key === sortKey;
    
    return (
        <TableHead 
            className={`cursor-pointer hover:bg-opacity-50 select-none ${className || ''}`}
            onClick={() => onSort(sortKey)}
            role="columnheader"
            aria-sort={isActive ? (currentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <div className="flex items-center gap-1">
                {label}
                <span className="ml-1" aria-hidden="true">
                    {isActive ? (
                        currentSort.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                        ) : (
                            <ArrowDown className="h-3 w-3" />
                        )
                    ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                </span>
            </div>
        </TableHead>
    );
};

// Expandable URI cell component
const ExpandableCell: React.FC<{
    content: string;
    maxWidth?: number;
}> = ({ content, maxWidth = 200 }) => {
    const [expanded, setExpanded] = useState(false);
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard');
    };
    
    if (content.length < 30) {
        return (
            <span className="font-mono text-xs" style={{ color: 'rgb(var(--theme-text))' }}>
                {content}
            </span>
        );
    }
    
    return (
        <div className="flex items-center gap-1">
            <span 
                className={`font-mono text-xs ${expanded ? '' : 'truncate'}`}
                style={{ 
                    maxWidth: expanded ? 'none' : maxWidth,
                    color: 'rgb(var(--theme-text))'
                }}
                title={content}
            >
                {content}
            </span>
            <div className="flex gap-0.5">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                    title={expanded ? 'Collapse' : 'Expand'}
                >
                    <ExternalLink className="h-3 w-3" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                </button>
                <button
                    onClick={copyToClipboard}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    aria-label="Copy to clipboard"
                    title="Copy to clipboard"
                >
                    <Copy className="h-3 w-3" style={{ color: 'rgb(var(--theme-text-muted))' }} />
                </button>
            </div>
        </div>
    );
};

function GeoPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // Initialize state from URL params
    const [geoData, setGeoData] = useState<GeoData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [timeWindow, setTimeWindow] = useState(searchParams.get('window') || '24h');
    const [selectedTab, setSelectedTab] = useState(searchParams.get('tab') || 'map');
    const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const { theme } = useTheme();
    const chartColors = useMemo(() => getChartColorsForTheme(theme), [theme]);
    
    // Sorting state
    const [countrySort, setCountrySort] = useState<SortConfig>({ key: 'requests', direction: 'desc' });
    const [citySort, setCitySort] = useState<SortConfig>({ key: 'requests', direction: 'desc' });
    const [requestSort, setRequestSort] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });

    // Update URL when state changes
    useEffect(() => {
        const params = new URLSearchParams();
        if (timeWindow !== '24h') params.set('window', timeWindow);
        if (selectedTab !== 'map') params.set('tab', selectedTab);
        if (searchQuery) params.set('search', searchQuery);
        
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }, [timeWindow, selectedTab, searchQuery]);

    const fetchGeoData = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        
        try {
            const response = await apiFetch(`/api/geo?window=${timeWindow}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setGeoData(data);
            setLastUpdated(Date.now());
            setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch geo data';
            setError(message);
            if (isRefresh) {
                toast.error('Failed to refresh geo data');
            } else {
                toast.error('Failed to load geo data');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [timeWindow]);

    useEffect(() => {
        fetchGeoData();
        const interval = setInterval(() => fetchGeoData(true), 30000);
        return () => clearInterval(interval);
    }, [fetchGeoData]);

    const handleLocationClick = (location: GeoLocation) => {
        setSelectedLocation(location);
        setSearchQuery(location.city);
    };
    
    // Generic sort function
    const sortData = <T extends Record<string, unknown>>(
        data: T[],
        sortConfig: SortConfig
    ): T[] => {
        if (!sortConfig.direction) return data;
        
        return [...data].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            
            if (sortConfig.direction === 'asc') {
                return aStr.localeCompare(bStr);
            }
            return bStr.localeCompare(aStr);
        });
    };
    
    const toggleSort = (setter: React.Dispatch<React.SetStateAction<SortConfig>>, key: string) => {
        setter(prev => ({
            key,
            direction: prev.key !== key ? 'desc' : prev.direction === 'desc' ? 'asc' : prev.direction === 'asc' ? null : 'desc'
        }));
    };

    const filteredCityStats = useMemo(() => {
        if (!geoData?.city_stats) return [];
        let data = geoData.city_stats;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            data = data.filter(
                stat => stat.city.toLowerCase().includes(query) || 
                        stat.country.toLowerCase().includes(query)
            );
        }
        return sortData(data, citySort);
    }, [geoData, searchQuery, citySort]);
    
    const sortedCountryStats = useMemo(() => {
        if (!geoData?.country_stats) return [];
        return sortData(geoData.country_stats, countrySort);
    }, [geoData, countrySort]);

    const filteredRequests = useMemo(() => {
        if (!geoData?.recent_requests) return [];
        let data = geoData.recent_requests;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            data = data.filter(
                req => req.city.toLowerCase().includes(query) || 
                       req.country.toLowerCase().includes(query) ||
                       req.client_ip.includes(query)
            );
        }
        return sortData(data, requestSort);
    }, [geoData, searchQuery, requestSort]);

    const countryPieData = useMemo(() => {
        if (!geoData?.country_stats) return [];
        return geoData.country_stats.slice(0, 8).map(stat => ({
            name: stat.country_code || stat.country,
            value: stat.requests,
            country: stat.country,
        }));
    }, [geoData]);

    const cityBarData = useMemo(() => {
        if (!geoData?.city_stats) return [];
        return geoData.city_stats.slice(0, 10).map(stat => ({
            name: stat.city.length > 20 ? stat.city.substring(0, 18) + '...' : stat.city,
            fullName: `${stat.city}, ${stat.country}`,
            requests: stat.requests,
            country: stat.country_code,
        }));
    }, [geoData]);
    
    // Export data as CSV
    const exportData = useCallback(() => {
        if (!geoData) return;
        
        const headers = ['Country', 'Country Code', 'Requests', 'Errors', 'Error Rate', 'Bandwidth'];
        const rows = geoData.country_stats.map(stat => [
            stat.country,
            stat.country_code,
            stat.requests,
            stat.errors,
            `${stat.error_rate.toFixed(2)}%`,
            formatBytes(stat.bandwidth)
        ]);
        
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geo-analytics-${timeWindow}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Data exported');
    }, [geoData, timeWindow]);

    if (loading && !geoData) {
        return (
            <div className="flex items-center justify-center h-96" role="status" aria-label="Loading geo data">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />
                <span className="sr-only">Loading geo data...</span>
            </div>
        );
    }

    if (error && !geoData) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4" role="alert">
                <AlertTriangle className="h-12 w-12 text-yellow-500" aria-hidden="true" />
                <p style={{ color: 'rgb(var(--theme-text-muted))' }}>{error}</p>
                <Button onClick={() => fetchGeoData()} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6" style={{ background: 'rgb(var(--theme-background))' }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'rgb(var(--theme-text))' }}>
                        <Globe className="h-6 w-6" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />
                        Geo Analytics
                    </h1>
                    <p className="text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                        Real-time geographic distribution of traffic
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {/* Data freshness indicator */}
                    <DataFreshnessIndicator
                        lastUpdated={lastUpdated}
                        isRefreshing={refreshing}
                        hasError={!!error && !!geoData}
                        onRetry={() => fetchGeoData(true)}
                    />
                    
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: 'rgb(var(--theme-text-muted))' }} aria-hidden="true" />
                        <input
                            type="text"
                            placeholder="Search city or country..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-3 py-2 w-48 text-sm rounded-md border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            style={{ 
                                background: 'rgb(var(--theme-surface))', 
                                borderColor: 'rgb(var(--theme-border))',
                                color: 'rgb(var(--theme-text))'
                            }}
                            aria-label="Search by city or country"
                        />
                    </div>
                    <Select value={timeWindow} onValueChange={setTimeWindow}>
                        <SelectTrigger 
                            className="w-32" 
                            style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}
                            aria-label="Select time window"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">Last 1h</SelectItem>
                            <SelectItem value="6h">Last 6h</SelectItem>
                            <SelectItem value="12h">Last 12h</SelectItem>
                            <SelectItem value="24h">Last 24h</SelectItem>
                            <SelectItem value="7d">Last 7d</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button 
                        onClick={exportData} 
                        variant="outline" 
                        size="icon"
                        title="Export data as CSV"
                        aria-label="Export data as CSV"
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button 
                        onClick={() => fetchGeoData(true)} 
                        variant="outline" 
                        size="icon" 
                        disabled={refreshing}
                        aria-label="Refresh data"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </Button>
                </div>
            </div>
            
            {/* Stale data warning banner */}
            {error && geoData && (
                <div 
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                    role="alert"
                >
                    <AlertTriangle className="h-5 w-5 text-yellow-500" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                            Data may be stale
                        </p>
                        <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">
                            Last refresh failed: {error}. Showing previously loaded data.
                        </p>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => fetchGeoData(true)}
                        className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10"
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Requests"
                    value={formatNumber(geoData?.total_requests || 0)}
                    icon={<Activity className="h-5 w-5" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />}
                    subtitle={`From ${geoData?.total_countries || 0} countries`}
                />
                <StatCard
                    title="Countries"
                    value={geoData?.total_countries || 0}
                    icon={<Flag className="h-5 w-5" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />}
                    subtitle="Unique countries"
                />
                <StatCard
                    title="Cities"
                    value={geoData?.total_cities || 0}
                    icon={<Building2 className="h-5 w-5" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />}
                    subtitle="Unique cities"
                />
                <StatCard
                    title="Top Country"
                    value={geoData?.top_country_code || 'N/A'}
                    icon={<TrendingUp className="h-5 w-5" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />}
                    subtitle={geoData?.country_stats?.[0]?.country || 'No data'}
                />
            </div>

            {/* Selected Location Info */}
            {selectedLocation && (
                <Card style={{ background: 'rgb(var(--theme-primary) / 0.1)', borderColor: 'rgb(var(--theme-primary))' }}>
                    <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <MapPin className="h-5 w-5" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />
                            <div>
                                <span className="font-medium" style={{ color: 'rgb(var(--theme-text))' }}>
                                    {selectedLocation.city}, {selectedLocation.country}
                                </span>
                                <span className="ml-4 text-sm" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                    {formatNumber(selectedLocation.requests)} requests • {selectedLocation.errors} errors • {selectedLocation.avg_latency.toFixed(1)}ms latency
                                </span>
                            </div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { setSelectedLocation(null); setSearchQuery(''); }}
                            aria-label="Clear selection"
                        >
                            Clear
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} id="geo-tabs">
                <TabsList style={{ background: 'rgb(var(--theme-surface))' }}>
                    <TabsTrigger value="map" className="flex items-center gap-2" aria-label="World Map tab">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                        World Map
                    </TabsTrigger>
                    <TabsTrigger value="countries" className="flex items-center gap-2" aria-label="Countries tab">
                        <Flag className="h-4 w-4" aria-hidden="true" />
                        Countries
                    </TabsTrigger>
                    <TabsTrigger value="cities" className="flex items-center gap-2" aria-label="Cities tab">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                        Cities
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="flex items-center gap-2" aria-label="Live Requests tab">
                        <Wifi className="h-4 w-4" aria-hidden="true" />
                        Live Requests
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="map" className="mt-4">
                    <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                        <CardHeader>
                            <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>Global Traffic Distribution</CardTitle>
                            <CardDescription style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Click on markers to filter data. Use controls to zoom and pan. Circle size indicates traffic volume.
                                Different shapes indicate status: ● healthy, ▲ warning, ◆ critical.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {geoData?.locations && geoData.locations.length > 0 ? (
                                <WorldMap 
                                    locations={geoData.locations} 
                                    onLocationClick={handleLocationClick}
                                    selectedCountry={selectedLocation?.country_code}
                                    chartColors={chartColors}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-96 text-center">
                                    <div>
                                        <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
                                        <p style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                            No geo-located requests yet.<br />
                                            Requests with X-Forwarded-For headers will appear here.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="countries" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Country Pie Chart with SLO reference */}
                        <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <CardHeader>
                                <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>Traffic by Country</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {countryPieData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={countryPieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                                            >
                                                {countryPieData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={chartColors.series[index % chartColors.series.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                formatter={(value) => [formatNumber(value as number), 'Requests']}
                                                contentStyle={{ 
                                                    background: chartColors.tooltipBg, 
                                                    border: `1px solid ${chartColors.tooltipBorder}`,
                                                    borderRadius: '8px',
                                                    color: chartColors.tooltipText
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-[300px]">
                                        <p style={{ color: 'rgb(var(--theme-text-muted))' }}>No country data available</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Country Table with sorting */}
                        <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <CardHeader>
                                <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>Country Statistics</CardTitle>
                                <CardDescription style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                    Click column headers to sort. Error rate SLO: &lt;{ERROR_RATE_CRITICAL}%
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[300px] overflow-auto relative">
                                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-100 dark:from-gray-800 pointer-events-none opacity-50" aria-hidden="true" />
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHeader 
                                                    label="Country" 
                                                    sortKey="country" 
                                                    currentSort={countrySort}
                                                    onSort={(key) => toggleSort(setCountrySort, key)}
                                                />
                                                <SortableHeader 
                                                    label="Requests" 
                                                    sortKey="requests" 
                                                    currentSort={countrySort}
                                                    onSort={(key) => toggleSort(setCountrySort, key)}
                                                    className="text-right"
                                                />
                                                <SortableHeader 
                                                    label="Errors" 
                                                    sortKey="error_rate" 
                                                    currentSort={countrySort}
                                                    onSort={(key) => toggleSort(setCountrySort, key)}
                                                    className="text-right"
                                                />
                                                <SortableHeader 
                                                    label="Bandwidth" 
                                                    sortKey="bandwidth" 
                                                    currentSort={countrySort}
                                                    onSort={(key) => toggleSort(setCountrySort, key)}
                                                    className="text-right"
                                                />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedCountryStats.map((stat, idx) => {
                                                const isCritical = stat.error_rate > ERROR_RATE_CRITICAL;
                                                const isWarning = stat.error_rate > ERROR_RATE_WARNING;
                                                
                                                return (
                                                    <TableRow key={idx}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline">{stat.country_code}</Badge>
                                                                <span style={{ color: 'rgb(var(--theme-text))' }}>{stat.country}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">{formatNumber(stat.requests)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {isCritical && <XCircle className="h-3 w-3 text-red-500" aria-hidden="true" />}
                                                                {isWarning && !isCritical && <AlertCircle className="h-3 w-3 text-yellow-500" aria-hidden="true" />}
                                                                <span 
                                                                    className={isCritical ? 'text-red-500 font-medium' : isWarning ? 'text-yellow-500' : ''}
                                                                    aria-label={`${stat.errors} errors, ${stat.error_rate.toFixed(1)}% error rate${isCritical ? ', critical' : isWarning ? ', warning' : ''}`}
                                                                >
                                                                    {stat.errors} ({stat.error_rate.toFixed(1)}%)
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">{formatBytes(stat.bandwidth)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {sortedCountryStats.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-8">
                                                        <span style={{ color: 'rgb(var(--theme-text-muted))' }}>No country data available</span>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="cities" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* City Bar Chart */}
                        <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <CardHeader>
                                <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>Top Cities</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {cityBarData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={cityBarData} layout="vertical" margin={{ left: 100 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                            <XAxis type="number" tick={{ fill: chartColors.axisLabel }} />
                                            <YAxis 
                                                type="category" 
                                                dataKey="name" 
                                                tick={{ fill: chartColors.axisLabel, fontSize: 12 }}
                                                width={100}
                                            />
                                            <RechartsTooltip
                                                formatter={(value) => [formatNumber(value as number), 'Requests']}
                                                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                                                contentStyle={{ 
                                                    background: chartColors.tooltipBg, 
                                                    border: `1px solid ${chartColors.tooltipBorder}`,
                                                    borderRadius: '8px',
                                                    color: chartColors.tooltipText
                                                }}
                                            />
                                            <Bar dataKey="requests" fill={chartColors.info} radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-[300px]">
                                        <p style={{ color: 'rgb(var(--theme-text-muted))' }}>No city data available</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* City Table with sorting */}
                        <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                            <CardHeader>
                                <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>
                                    City Details
                                    {searchQuery && (
                                        <span className="ml-2 text-sm font-normal" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                            (filtered: {filteredCityStats.length})
                                        </span>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[300px] overflow-auto relative">
                                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-100 dark:from-gray-800 pointer-events-none opacity-50" aria-hidden="true" />
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHeader 
                                                    label="City" 
                                                    sortKey="city" 
                                                    currentSort={citySort}
                                                    onSort={(key) => toggleSort(setCitySort, key)}
                                                />
                                                <SortableHeader 
                                                    label="Country" 
                                                    sortKey="country" 
                                                    currentSort={citySort}
                                                    onSort={(key) => toggleSort(setCitySort, key)}
                                                />
                                                <SortableHeader 
                                                    label="Requests" 
                                                    sortKey="requests" 
                                                    currentSort={citySort}
                                                    onSort={(key) => toggleSort(setCitySort, key)}
                                                    className="text-right"
                                                />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredCityStats.map((stat, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell style={{ color: 'rgb(var(--theme-text))' }}>{stat.city}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{stat.country_code}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatNumber(stat.requests)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {filteredCityStats.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center py-8">
                                                        <span style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                                            {searchQuery ? 'No cities match your search' : 'No city data available'}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="requests" className="mt-4">
                    <Card style={{ background: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
                        <CardHeader>
                            <CardTitle style={{ color: 'rgb(var(--theme-text))' }}>
                                Recent Geo-Located Requests
                                {searchQuery && (
                                    <span className="ml-2 text-sm font-normal" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                        (filtered: {filteredRequests.length})
                                    </span>
                                )}
                            </CardTitle>
                            <CardDescription style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                Live stream of requests with geographic data. Auto-refreshes every 30 seconds.
                                Latency SLO: &lt;{LATENCY_WARNING}ms (warning), &lt;{LATENCY_CRITICAL}ms (critical)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-[500px] overflow-auto relative">
                                <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-100 dark:from-gray-800 pointer-events-none opacity-50" aria-hidden="true" />
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <SortableHeader 
                                                label="Time (UTC)" 
                                                sortKey="timestamp" 
                                                currentSort={requestSort}
                                                onSort={(key) => toggleSort(setRequestSort, key)}
                                            />
                                            <TableHead>Client IP</TableHead>
                                            <SortableHeader 
                                                label="Location" 
                                                sortKey="city" 
                                                currentSort={requestSort}
                                                onSort={(key) => toggleSort(setRequestSort, key)}
                                            />
                                            <TableHead>Method</TableHead>
                                            <TableHead>URI</TableHead>
                                            <SortableHeader 
                                                label="Status" 
                                                sortKey="status" 
                                                currentSort={requestSort}
                                                onSort={(key) => toggleSort(setRequestSort, key)}
                                                className="text-right"
                                            />
                                            <SortableHeader 
                                                label="Latency" 
                                                sortKey="latency_ms" 
                                                currentSort={requestSort}
                                                onSort={(key) => toggleSort(setRequestSort, key)}
                                                className="text-right"
                                            />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredRequests.slice(0, 100).map((req, idx) => {
                                            const latency = req.latency_ms || 0;
                                            const isLatencyCritical = latency > LATENCY_CRITICAL;
                                            const isLatencyWarning = latency > LATENCY_WARNING;
                                            
                                            return (
                                                <TableRow key={idx}>
                                                    <TableCell className="text-xs font-mono" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                                        {formatTimestamp(req.timestamp)}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">{req.client_ip}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="text-xs">{req.country_code}</Badge>
                                                            <span className="text-sm" style={{ color: 'rgb(var(--theme-text))' }}>
                                                                {req.city}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge 
                                                            variant="outline"
                                                            style={{
                                                                color: req.method === 'GET' ? chartColors.success :
                                                                       req.method === 'POST' ? chartColors.info :
                                                                       req.method === 'PUT' ? chartColors.warning :
                                                                       req.method === 'DELETE' ? chartColors.error :
                                                                       chartColors.axis,
                                                                borderColor: req.method === 'GET' ? chartColors.success :
                                                                             req.method === 'POST' ? chartColors.info :
                                                                             req.method === 'PUT' ? chartColors.warning :
                                                                             req.method === 'DELETE' ? chartColors.error :
                                                                             chartColors.axis
                                                            }}
                                                        >
                                                            {req.method}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="max-w-[200px]">
                                                        <ExpandableCell content={req.uri} />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge 
                                                            variant={req.status >= 400 ? 'destructive' : 'default'}
                                                            style={req.status >= 200 && req.status < 300 ? { 
                                                                background: chartColors.success,
                                                                color: '#fff'
                                                            } : {}}
                                                        >
                                                            {req.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isLatencyCritical && <XCircle className="h-3 w-3 text-red-500" aria-hidden="true" />}
                                                            {isLatencyWarning && !isLatencyCritical && <AlertCircle className="h-3 w-3 text-yellow-500" aria-hidden="true" />}
                                                            <span 
                                                                className={`font-mono text-xs ${isLatencyCritical ? 'text-red-500 font-medium' : isLatencyWarning ? 'text-yellow-500' : ''}`}
                                                                aria-label={`${latency}ms${isLatencyCritical ? ', critical' : isLatencyWarning ? ', warning' : ''}`}
                                                            >
                                                                {latency > 0 ? `${latency}ms` : '-'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {filteredRequests.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8">
                                                    <span style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                                        {searchQuery ? 'No requests match your search' : 'No geo-located requests yet. Requests with X-Forwarded-For headers will appear here.'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            {filteredRequests.length > 100 && (
                                <p className="text-center text-xs mt-2" style={{ color: 'rgb(var(--theme-text-muted))' }}>
                                    Showing 100 of {filteredRequests.length} requests
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function GeoPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-96" role="status" aria-label="Loading">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'rgb(var(--theme-primary))' }} aria-hidden="true" />
                <span className="sr-only">Loading...</span>
            </div>
        }>
            <GeoPageContent />
        </Suspense>
    );
}
