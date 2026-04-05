"use client";

import React, { useState, useEffect } from "react";
import { Activity, Plus, Target, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiFetch, getBasePath } from "@/lib/api";

const LATENCY_SLO_TYPES = new Set(["latency", "latency_p95", "latency_p50"]);

/** Percentage SLIs where higher is better (error-budget style). */
const PERCENT_HIGHER_BETTER = new Set([
    "availability",
    "success_rate",
    "availability_no_4xx",
]);

const SLO_TYPE_OPTIONS: { value: string; label: string; defaultTarget: number }[] = [
    { value: "availability", label: "Availability (non-5xx)", defaultTarget: 99.9 },
    { value: "success_rate", label: "Success rate (2xx only)", defaultTarget: 99.5 },
    { value: "availability_no_4xx", label: "No 4xx/5xx (2xx–3xx)", defaultTarget: 99.0 },
    { value: "latency", label: "Latency p99 (ms)", defaultTarget: 500 },
    { value: "latency_p95", label: "Latency p95 (ms)", defaultTarget: 300 },
    { value: "latency_p50", label: "Latency p50 / median (ms)", defaultTarget: 100 },
];

function sloTypeLabel(value: string): string {
    return SLO_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function isLatencySloType(sloType: string): boolean {
    return LATENCY_SLO_TYPES.has(sloType);
}

function usesErrorBudget(sloType: string): boolean {
    return PERCENT_HIGHER_BETTER.has(sloType);
}

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

function targetDraftKey(r: SLOComplianceResult): string {
    return r.target.id;
}

export default function SLOPage() {
    const [results, setResults] = useState<SLOComplianceResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [newSloType, setNewSloType] = useState<string>(SLO_TYPE_OPTIONS[0].value);
    /** String values for target inputs, keyed by SLO row id */
    const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
    const [savingTargetId, setSavingTargetId] = useState<string | null>(null);

    useEffect(() => {
        const next: Record<string, string> = {};
        for (const r of results) {
            next[targetDraftKey(r)] = String(r.target.target_value);
        }
        setTargetDrafts(next);
    }, [results]);

    const fetchCompliance = async (opts?: { quiet?: boolean }) => {
        if (!opts?.quiet) setLoading(true);
        try {
            const res = await apiFetch("/api/slo-compliance");
            if (res.status === 401 || res.status === 403) {
                const base = getBasePath();
                toast.error("Sign-in required", {
                    description: `Open ${base || ""}/login to authenticate with the gateway, then reload this page.`,
                });
                setResults([]);
                return;
            }
            if (!res.ok) throw new Error("Failed to fetch SLO compliance");
            const data = await res.json();
            setResults(data || []);
        } catch {
            toast.error("Could not load SLO data");
        } finally {
            if (!opts?.quiet) setLoading(false);
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
        } catch {
            toast.error("Could not delete SLO target");
        }
    };

    const addSLOTarget = async () => {
        const spec = SLO_TYPE_OPTIONS.find((o) => o.value === newSloType) ?? SLO_TYPE_OPTIONS[0];
        const newTarget: Partial<SLOTarget> = {
            entity_type: "global",
            entity_id: "all",
            slo_type: spec.value,
            target_value: spec.defaultTarget,
            time_window: "30d",
        };
        try {
            const res = await apiFetch("/api/slo-targets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newTarget),
            });
            if (res.status === 401 || res.status === 403) {
                const base = getBasePath();
                toast.error("Sign-in required", {
                    description: `Open ${base || ""}/login to authenticate, then try again.`,
                });
                return;
            }
            if (!res.ok) throw new Error("Failed to create");
            toast.success(`SLO target created (${spec.label})`);
            fetchCompliance();
        } catch {
            toast.error("Could not create SLO target");
        }
    };

    const saveTargetSLO = async (r: SLOComplianceResult) => {
        const k = targetDraftKey(r);
        const raw = targetDrafts[k] ?? String(r.target.target_value);
        const val = parseFloat(raw);
        if (Number.isNaN(val) || !Number.isFinite(val)) {
            toast.error("Enter a valid number for the target");
            return;
        }
        const latency = isLatencySloType(r.target.slo_type);
        if (!latency && (val < 0 || val > 100)) {
            toast.error("Percentage targets must be between 0 and 100");
            return;
        }
        if (latency && val <= 0) {
            toast.error("Latency target must be positive (milliseconds)");
            return;
        }

        const body = {
            entity_type: r.target.entity_type,
            entity_id: r.target.entity_id,
            slo_type: r.target.slo_type,
            target_value: val,
            time_window: r.target.time_window,
        };

        setSavingTargetId(r.target.id);
        try {
            const res = await apiFetch("/api/slo-targets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.status === 401 || res.status === 403) {
                const base = getBasePath();
                toast.error("Sign-in required", {
                    description: `Open ${base || ""}/login to authenticate, then try again.`,
                });
                return;
            }
            if (!res.ok) {
                const t = await res.text().catch(() => "");
                throw new Error(t || res.statusText);
            }
            toast.success("Target SLO updated");
            await fetchCompliance({ quiet: true });
        } catch {
            toast.error("Could not update target");
        } finally {
            setSavingTargetId(null);
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
                        Track availability, success rate, and latency targets across your fleet.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
                    <Select value={newSloType} onValueChange={setNewSloType}>
                        <SelectTrigger className="w-full sm:w-[280px] bg-neutral-900 border-neutral-700 text-neutral-200">
                            <SelectValue placeholder="SLO type" />
                        </SelectTrigger>
                        <SelectContent>
                            {SLO_TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={addSLOTarget} className="bg-sky-600 hover:bg-sky-500 text-white shrink-0">
                        <Plus className="h-4 w-4 mr-2" />
                        New SLO target
                    </Button>
                </div>
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
                        <Button onClick={addSLOTarget} variant="outline" className="mt-4">
                            Create SLO target
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                    {results.map((r) => {
                        const budget = getBudgetRemaining(r.sli, r.target.target_value);
                        const latency = isLatencySloType(r.target.slo_type);
                        const isViolating = latency
                            ? r.sli > r.target.target_value
                            : budget.remaining < 0;
                        const rowKey = targetDraftKey(r);
                        const draftStr = targetDrafts[rowKey] ?? String(r.target.target_value);
                        const draftNum = parseFloat(draftStr);
                        const targetDirty =
                            !Number.isNaN(draftNum) &&
                            Math.abs(draftNum - r.target.target_value) > 1e-9;

                        return (
                            <Card key={r.target.id} className="bg-neutral-900 border-neutral-800 flex flex-col">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div>
                                        <CardTitle className="text-lg text-white capitalize flex items-center gap-2">
                                            {r.target.entity_type} — {sloTypeLabel(r.target.slo_type)}
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
                                                {latency
                                                    ? `${r.sli.toFixed(2)}ms`
                                                    : `${r.sli.toFixed(3)}%`}
                                            </p>
                                        </div>
                                        <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Target SLO</p>
                                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                                <div className="flex flex-1 items-center gap-2 min-w-0">
                                                    {latency && (
                                                        <span className="text-sm text-neutral-500 shrink-0">&lt;</span>
                                                    )}
                                                    <Input
                                                        type="number"
                                                        step={latency ? "1" : "0.01"}
                                                        min={latency ? "0.001" : "0"}
                                                        max={latency ? undefined : "100"}
                                                        className="bg-neutral-900 border-neutral-700 text-white font-mono h-10"
                                                        value={draftStr}
                                                        onChange={(e) =>
                                                            setTargetDrafts((s) => ({
                                                                ...s,
                                                                [rowKey]: e.target.value,
                                                            }))
                                                        }
                                                        aria-label="Target SLO value"
                                                    />
                                                    <span className="text-sm text-neutral-400 shrink-0 whitespace-nowrap">
                                                        {latency ? "ms" : "%"}
                                                    </span>
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    className="shrink-0 bg-sky-700 hover:bg-sky-600 text-white border-0"
                                                    disabled={!targetDirty || savingTargetId === r.target.id}
                                                    onClick={() => saveTargetSLO(r)}
                                                >
                                                    {savingTargetId === r.target.id ? "Saving…" : "Save target"}
                                                </Button>
                                            </div>
                                            <p className="text-xs text-neutral-500 mt-2">
                                                {latency
                                                    ? "SLI must stay at or below this latency."
                                                    : "SLI should meet or exceed this percentage."}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {usesErrorBudget(r.target.slo_type) && (
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
