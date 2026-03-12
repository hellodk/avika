"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    Globe, Activity, AlertTriangle, Clock, Server, LayoutDashboard, Pin, PinOff, GripVertical, Check
} from "lucide-react";

export interface DashboardWidget {
    id: string;
    label: string;
    icon: any;
    description: string;
    pinned: boolean;
}

const ALL_WIDGETS: DashboardWidget[] = [
    { id: "total_requests", label: "Total Requests", icon: Globe, description: "Total HTTP request count for the time window.", pinned: true },
    { id: "request_rate", label: "Request Rate", icon: Activity, description: "Average requests per second.", pinned: true },
    { id: "error_rate", label: "Error Rate", icon: AlertTriangle, description: "Percentage of 5xx error responses.", pinned: true },
    { id: "avg_latency", label: "Avg Latency", icon: Clock, description: "P50 average response time in ms.", pinned: true },
    { id: "agent_count", label: "Active Agents", icon: Server, description: "Number of connected Avika agents.", pinned: false },
];

const DASHBOARD_PREFS_KEY = "avika_dashboard_widgets";

export function useDashboardWidgets() {
    const [widgets, setWidgets] = useState<DashboardWidget[]>(ALL_WIDGETS);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(DASHBOARD_PREFS_KEY);
            if (saved) {
                try {
                    const savedIds: { id: string; pinned: boolean }[] = JSON.parse(saved);
                    setWidgets(ALL_WIDGETS.map(w => ({
                        ...w,
                        pinned: savedIds.find(s => s.id === w.id)?.pinned ?? w.pinned,
                    })));
                } catch {}
            }
        }
    }, []);

    const togglePin = (id: string) => {
        setWidgets(prev => {
            const updated = prev.map(w => w.id === id ? { ...w, pinned: !w.pinned } : w);
            localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(updated.map(w => ({ id: w.id, pinned: w.pinned }))));
            return updated;
        });
    };

    const pinnedWidgets = widgets.filter(w => w.pinned);

    return { widgets, pinnedWidgets, togglePin };
}

interface DashboardBuilderProps {
    widgets: DashboardWidget[];
    onTogglePin: (id: string) => void;
}

export function DashboardBuilderButton({ widgets, onTogglePin }: DashboardBuilderProps) {
    const [open, setOpen] = useState(false);
    const pinnedCount = widgets.filter(w => w.pinned).length;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="hidden md:flex items-center gap-2"
                style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
            >
                <LayoutDashboard className="h-4 w-4" />
                Customize ({pinnedCount} pinned)
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                    <DialogHeader>
                        <DialogTitle style={{ color: "rgb(var(--theme-text))" }} className="flex items-center gap-2">
                            <LayoutDashboard className="h-5 w-5 text-indigo-500" />
                            Customize Dashboard
                        </DialogTitle>
                        <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Pin or unpin KPI cards to personalize your view.
                        </p>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        {widgets.map((widget) => {
                            const Icon = widget.icon;
                            return (
                                <div
                                    key={widget.id}
                                    className="flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer"
                                    style={{
                                        background: widget.pinned ? "rgba(99,102,241,0.05)" : "rgb(var(--theme-background))",
                                        borderColor: widget.pinned ? "rgba(99,102,241,0.3)" : "rgb(var(--theme-border))"
                                    }}
                                    onClick={() => onTogglePin(widget.id)}
                                >
                                    <GripVertical className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                    <div className={`p-2 rounded-lg flex-shrink-0 ${widget.pinned ? "bg-indigo-500/10" : "bg-gray-500/10"}`}>
                                        <Icon className={`h-4 w-4 ${widget.pinned ? "text-indigo-400" : "text-gray-500"}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text))" }}>{widget.label}</p>
                                        <p className="text-xs truncate" style={{ color: "rgb(var(--theme-text-muted))" }}>{widget.description}</p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        {widget.pinned ? (
                                            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 flex items-center gap-1">
                                                <Check className="h-3 w-3" />
                                                Pinned
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-gray-500 flex items-center gap-1">
                                                <PinOff className="h-3 w-3" />
                                                Hidden
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            Save Layout
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
