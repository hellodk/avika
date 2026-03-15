"use client";

import React, { useState, useEffect } from "react";
import { Activity, Plus, Target, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface SLOTarget {
    id: string;
    entity_type: string;
    entity_id: string;
    slo_type: string;
    target_value: number;
    time_window: string;
    created_at: string;
    updated_at: string;
}

interface SLOComplianceResult {
    target: SLOTarget;
    sli: number;
}

export default function SLOPage() {
    const [results, setResults] = useState<SLOComplianceResult[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCompliance = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/slo-compliance");
            if (!res.ok) throw new Error("Failed to fetch SLO compliance");
            const data = await res.json();
            setResults(data || []);
        } catch (error) {
            toast.error("Could not load SLO data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCompliance();
    }, []);

    const deleteSLO = async (id: string) => {
        if (!confirm("Delete this SLO Target?")) return;
        try {
            const res = await apiFetch(`/api/slo-targets?id=${id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete");
            toast.success("SLO Target deleted");
            fetchCompliance();
        } catch (e) {
            toast.error("Could not delete SLO target");
        }
    };

    const addMockSLO = async () => {
        // In a real app this would open a modal form
        const newTarget: Partial<SLOTarget> = {
            entity_type: "global",
            entity_id: "all",
            slo_type: "availability",
            target_value: 99.9,
            time_window: "30d"
        };
        try {
            const res = await apiFetch("/api/slo-targets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newTarget)
            });
            if (!res.ok) throw new Error("Failed to create");
            toast.success("Default Global Availability SLO created");
            fetchCompliance();
        } catch (e) {
            toast.error("Could not create SLO target");
        }
    };

    const getBudgetRemaining = (sli: number, target: number) => {
        // E.g. Target 99.9%, SLI 99.95%, Budget is positive. Error budget is (100 - Target).
        const errorBudget = 100 - target;
        const currentErrors = 100 - sli;
        const remaining = errorBudget - currentErrors;
        return {
            remaining,
            percentage: (remaining / errorBudget) * 100
        };
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 text-neutral-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Target className="h-6 w-6 text-sky-400" />
                        Service Level Objectives (SLO)
                    </h1>
                    <p className="text-neutral-400 mt-1">
                        Track availability and latency targets across your fleet.
                    </p>
                </div>
                <Button onClick={addMockSLO} className="bg-sky-600 hover:bg-sky-500 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    New SLO Target
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Activity className="h-8 w-8 animate-pulse text-sky-500" />
                </div>
            ) : results.length === 0 ? (
                <Card className="bg-neutral-900 border-neutral-800">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                        <ShieldAlert className="h-12 w-12 text-neutral-600" />
                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">No SLOs defined</h3>
                            <p className="text-neutral-400 max-w-sm">
                                Create an SLO target to start tracking reliability and error budgets.
                            </p>
                        </div>
                        <Button onClick={addMockSLO} variant="outline" className="mt-4">
                            Create default SLO
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                    {results.map((r) => {
                        const budget = getBudgetRemaining(r.sli, r.target.target_value);
                        const isViolating = budget.remaining < 0;

                        return (
                            <Card key={r.target.id} className="bg-neutral-900 border-neutral-800 flex flex-col">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div>
                                        <CardTitle className="text-lg text-white capitalize flex items-center gap-2">
                                            {r.target.entity_type} {r.target.slo_type}
                                            {isViolating && <ShieldAlert className="h-4 w-4 text-red-500" />}
                                        </CardTitle>
                                        <CardDescription className="text-neutral-400 mt-1">
                                            {r.target.entity_type === 'global' ? 'All traffic' : r.target.entity_id} • {r.target.time_window}
                                        </CardDescription>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => deleteSLO(r.target.id)} className="text-neutral-500 hover:text-red-400">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="pt-4 flex-1">
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Current SLI</p>
                                            <p className={`text-2xl font-bold ${isViolating ? 'text-red-400' : 'text-green-400'}`}>
                                                {r.target.slo_type === 'latency' 
                                                    ? `${r.sli.toFixed(2)}ms` 
                                                    : `${r.sli.toFixed(3)}%`}
                                            </p>
                                        </div>
                                        <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Target SLO</p>
                                            <p className="text-2xl font-bold text-white">
                                                {r.target.slo_type === 'latency' 
                                                    ? `< ${r.target.target_value}ms` 
                                                    : `${r.target.target_value}%`}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {r.target.slo_type === 'availability' && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-neutral-400">Error Budget Remaining</span>
                                                <span className={budget.percentage > 0 ? "text-green-400" : "text-red-400"}>
                                                    {budget.percentage.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-neutral-950 rounded-full h-2.5 overflow-hidden">
                                                <div 
                                                    className={`h-2.5 rounded-full ${budget.percentage > 25 ? 'bg-green-500' : budget.percentage > 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${Math.min(Math.max(budget.percentage, 0), 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
