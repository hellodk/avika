"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Zap, TrendingUp, Settings2, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Recommendation {
    id: number;
    title: string;
    description: string;
    details: string;
    impact: string;
    category: string;
    confidence: number;
    estimatedImprovement: string;
    currentConfig: string;
    suggestedConfig: string;
    server: string;
}

// Skeleton component
function RecommendationSkeleton() {
    return (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
            <CardHeader>
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                        <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                        <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2">
                    <div className="h-8 w-32 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                    <div className="h-8 w-24 rounded animate-pulse" style={{ background: "rgb(var(--theme-border))" }} />
                </div>
            </CardContent>
        </Card>
    );
}

export default function OptimizationPage() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [applyOpen, setApplyOpen] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [appliedIds, setAppliedIds] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fetchRecommendations = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch('/api/optimization');
            if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
            const data = await res.json();
            // Handle both array and object with recommendations property
            const recs = Array.isArray(data) ? data : (data.recommendations || []);
            setRecommendations(recs.map((rec: any) => ({
                ...rec,
                estimatedImprovement: rec.estimated_improvement || rec.estimatedImprovement,
                currentConfig: rec.current_config || rec.currentConfig,
                suggestedConfig: rec.suggested_config || rec.suggestedConfig
            })));
        } catch (error: any) {
            console.error("Failed to fetch recommendations:", error);
            setError(error.message);
            toast.error("Failed to fetch recommendations", { description: error.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
        const interval = setInterval(fetchRecommendations, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleViewDetails = (rec: Recommendation) => {
        setSelectedRec(rec);
        setDetailsOpen(true);
    };

    const handleApplyClick = (rec: Recommendation) => {
        setSelectedRec(rec);
        setApplyOpen(true);
    };

    const confirmApply = async () => {
        setIsApplying(true);
        try {
            if (!selectedRec) return;

            let context = "http";
            if (selectedRec.suggestedConfig.includes("worker_connections")) {
                context = "events";
            }

            const res = await apiFetch('/api/optimization', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recommendation_id: selectedRec.id,
                    server: selectedRec.server,
                    suggested_config: selectedRec.suggestedConfig,
                    context: context
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setAppliedIds([...appliedIds, selectedRec.id]);
                setApplyOpen(false);
                toast.success("Optimization applied", { description: `Changes applied to ${selectedRec.server}` });
            } else {
                toast.error("Failed to apply optimization", { description: data.error || "Unknown error" });
            }
        } catch (error: any) {
            console.error("Error applying optimization:", error);
            toast.error("Error applying optimization", { description: error.message });
        } finally {
            setIsApplying(false);
        }
    };

    const activeRecommendations = recommendations.filter(rec => !appliedIds.includes(rec.id));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
                        AI Tuner
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        AI-powered configuration optimization recommendations
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchRecommendations}
                        disabled={loading}
                        style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        <Zap className="h-3 w-3 mr-1" />
                        {activeRecommendations.length} Active
                    </Badge>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {loading ? (
                    <>
                        <RecommendationSkeleton />
                        <RecommendationSkeleton />
                        <RecommendationSkeleton />
                    </>
                ) : activeRecommendations.length === 0 ? (
                    <div 
                        className="text-center py-20 rounded-lg border border-dashed"
                        style={{ 
                            background: "rgb(var(--theme-surface))", 
                            borderColor: "rgb(var(--theme-border))" 
                        }}
                    >
                        <div 
                            className="inline-flex items-center justify-center p-4 rounded-full mb-4"
                            style={{ background: "rgba(var(--theme-primary), 0.1)" }}
                        >
                            <Sparkles className="h-8 w-8" style={{ color: "rgb(var(--theme-primary))" }} />
                        </div>
                        <h3 className="text-lg font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                            System Optimized
                        </h3>
                        <p className="max-w-sm mx-auto mt-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                            No anomalies detected. The AI engine is monitoring your fleet in real-time.
                        </p>
                    </div>
                ) : (
                    activeRecommendations.map((rec) => (
                        <Card 
                            key={rec.id} 
                            style={{ 
                                background: "rgb(var(--theme-surface))", 
                                borderColor: "rgb(var(--theme-border))" 
                            }}
                        >
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg ${
                                            rec.impact === "high" 
                                                ? "bg-purple-500/20 text-purple-400" 
                                                : "bg-blue-500/20 text-blue-400"
                                        }`}>
                                            {rec.category === "Performance" ? (
                                                <TrendingUp className="h-5 w-5" />
                                            ) : (
                                                <Settings2 className="h-5 w-5" />
                                            )}
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <CardTitle 
                                                    className="text-base" 
                                                    style={{ color: "rgb(var(--theme-text))" }}
                                                >
                                                    {rec.title}
                                                </CardTitle>
                                                <Badge className={`text-xs ${
                                                    rec.impact === "high"
                                                        ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                                        : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                                }`}>
                                                    {rec.impact} impact
                                                </Badge>
                                                <Badge 
                                                    className="text-xs"
                                                    style={{ 
                                                        background: "rgb(var(--theme-surface))",
                                                        color: "rgb(var(--theme-text-muted))",
                                                        borderColor: "rgb(var(--theme-border))"
                                                    }}
                                                >
                                                    {rec.server}
                                                </Badge>
                                            </div>
                                            <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                {rec.description}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                                <span style={{ color: "rgb(var(--theme-text))" }}>
                                                    Confidence: {(rec.confidence * 100).toFixed(0)}%
                                                </span>
                                                <span className="text-emerald-400 font-medium">
                                                    {rec.estimatedImprovement}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700 text-white"
                                        onClick={() => handleApplyClick(rec)}
                                    >
                                        Apply Recommendation
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleViewDetails(rec)}
                                        style={{ 
                                            borderColor: "rgb(var(--theme-border))",
                                            color: "rgb(var(--theme-text-muted))"
                                        }}
                                    >
                                        View Details
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}

                {recommendations.length > 0 && appliedIds.length === recommendations.length && (
                    <div className="text-center py-10">
                        <div className="inline-flex items-center justify-center p-4 bg-emerald-500/20 rounded-full mb-4">
                            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                            All Optimized!
                        </h3>
                        <p style={{ color: "rgb(var(--theme-text-muted))" }}>
                            No pending recommendations at this time.
                        </p>
                    </div>
                )}
            </div>

            {/* Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent 
                    className="sm:max-w-xl"
                    style={{ 
                        background: "rgb(var(--theme-background))",
                        borderColor: "rgb(var(--theme-border))",
                        color: "rgb(var(--theme-text))"
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-purple-400" />
                            {selectedRec?.title}
                        </DialogTitle>
                        <DialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            Target: <span className="font-mono">{selectedRec?.server}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Analysis</h4>
                            <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                {selectedRec?.details}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Configuration Change</h4>
                            <div className="bg-neutral-950 rounded-md p-3 font-mono text-sm">
                                <div className="text-rose-400 opacity-70">- {selectedRec?.currentConfig}</div>
                                <div className="text-emerald-400">+ {selectedRec?.suggestedConfig}</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm pt-2">
                            <div style={{ color: "rgb(var(--theme-text-muted))" }}>Confidence Score</div>
                            <div className="font-bold">{((selectedRec?.confidence || 0) * 100).toFixed(0)}%</div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setDetailsOpen(false)}
                            style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
                        >
                            Close
                        </Button>
                        <Button 
                            className="bg-purple-600 hover:bg-purple-700 text-white" 
                            onClick={() => {
                                setDetailsOpen(false);
                                if (selectedRec) handleApplyClick(selectedRec);
                            }}
                        >
                            Apply Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Apply Confirmation Dialog */}
            <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
                <DialogContent 
                    className="sm:max-w-md"
                    style={{ 
                        background: "rgb(var(--theme-background))",
                        borderColor: "rgb(var(--theme-border))",
                        color: "rgb(var(--theme-text))"
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Apply Optimization?</DialogTitle>
                        <DialogDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
                            This will apply the configuration changes to <span className="font-mono">{selectedRec?.server}</span> and reload NGINX.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 flex items-start gap-3 my-2">
                        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-300">
                            Safe mode is enabled. If the configuration fails validation, NGINX will automatically revert to the previous working configuration.
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button 
                            variant="outline" 
                            onClick={() => setApplyOpen(false)} 
                            disabled={isApplying}
                            style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
                        >
                            Cancel
                        </Button>
                        <Button 
                            className="bg-purple-600 hover:bg-purple-700 text-white" 
                            onClick={confirmApply} 
                            disabled={isApplying}
                        >
                            {isApplying ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Applying...
                                </>
                            ) : (
                                "Confirm & Apply"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
