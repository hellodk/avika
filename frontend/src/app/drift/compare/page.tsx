"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/lib/project-context";
import { apiFetch, serverIdForDisplay } from "@/lib/api";
import { toast } from "sonner";

interface ProjectGroupItem {
    id: string;
    name: string;
    environment_id: string;
    environment_name: string;
}

interface DriftItem {
    agent_id: string;
    hostname: string;
    status: string;
    current_hash?: string;
    severity?: string;
    diff_summary?: string;
    diff_content?: string;
    error_message?: string;
}

interface CompareResult {
    group_a_id: string;
    group_a_name: string;
    group_b_id: string;
    group_b_name: string;
    baseline_type: string;
    baseline_hash?: string;
    items: DriftItem[];
    compared_at: number;
}

export default function DriftComparePage() {
    const { selectedProject } = useProject();
    const [groups, setGroups] = useState<ProjectGroupItem[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupA, setGroupA] = useState<string>("");
    const [groupB, setGroupB] = useState<string>("");
    const [compareLoading, setCompareLoading] = useState(false);
    const [result, setResult] = useState<CompareResult | null>(null);
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

    const fetchGroups = useCallback(async () => {
        if (!selectedProject?.id) {
            setGroups([]);
            return;
        }
        setGroupsLoading(true);
        try {
            const res = await apiFetch(`/api/projects/${selectedProject.id}/groups`);
            if (!res.ok) throw new Error("Failed to fetch groups");
            const data = await res.json();
            setGroups(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error("Failed to load groups");
            setGroups([]);
        } finally {
            setGroupsLoading(false);
        }
    }, [selectedProject?.id]);

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    const handleCompare = async () => {
        if (!selectedProject?.id || !groupA || !groupB) {
            toast.error("Select a project and both groups");
            return;
        }
        if (groupA === groupB) {
            toast.error("Select two different groups");
            return;
        }
        setCompareLoading(true);
        setResult(null);
        try {
            const url = `/api/projects/${selectedProject.id}/drift/compare?groupA=${encodeURIComponent(groupA)}&groupB=${encodeURIComponent(groupB)}`;
            const res = await apiFetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Compare failed");
            setResult(data);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Compare failed");
        } finally {
            setCompareLoading(false);
        }
    };

    const groupLabel = (g: ProjectGroupItem) => `${g.name} (${g.environment_name})`;

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/inventory" className="text-neutral-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back
                        </Link>
                    </Button>
                </div>

                <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <GitCompare className="h-5 w-5" /> Compare groups
                        </CardTitle>
                        <CardDescription className="text-neutral-400">
                            Use group A as baseline and compare each agent in group B. Both groups must belong to the same project.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!selectedProject ? (
                            <p className="text-neutral-500">Select a project in the sidebar to list groups.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-neutral-400">Group A (baseline)</label>
                                        <Select value={groupA} onValueChange={setGroupA} disabled={groupsLoading}>
                                            <SelectTrigger className="bg-neutral-950 border-neutral-700 text-white">
                                                <SelectValue placeholder="Select group A" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {groups.map((g) => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {groupLabel(g)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-neutral-400">Group B (compare)</label>
                                        <Select value={groupB} onValueChange={setGroupB} disabled={groupsLoading}>
                                            <SelectTrigger className="bg-neutral-950 border-neutral-700 text-white">
                                                <SelectValue placeholder="Select group B" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {groups.map((g) => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {groupLabel(g)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <Button
                                    onClick={handleCompare}
                                    disabled={compareLoading || !groupA || !groupB || groupA === groupB}
                                >
                                    {compareLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <GitCompare className="h-4 w-4 mr-2" />
                                    )}
                                    Compare
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>

                {result && (
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <CardTitle className="text-white text-lg">
                                {result.group_a_name} → {result.group_b_name}
                            </CardTitle>
                            <CardDescription className="text-neutral-400">
                                Baseline: {result.baseline_type}
                                {result.baseline_hash && (
                                    <span className="ml-2 font-mono text-xs">{result.baseline_hash.slice(0, 12)}…</span>
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border border-neutral-800 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-neutral-800 bg-neutral-950/50">
                                            <th className="text-left py-2 px-3 text-neutral-400 font-medium">Agent / Hostname</th>
                                            <th className="text-left py-2 px-3 text-neutral-400 font-medium">Status</th>
                                            <th className="text-left py-2 px-3 text-neutral-400 font-medium">Summary</th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.items.map((item) => (
                                            <React.Fragment key={item.agent_id}>
                                                <tr
                                                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
                                                >
                                                    <td className="py-2 px-3">
                                                        <Link
                                                            href={`/servers/${encodeURIComponent(serverIdForDisplay(item.agent_id))}`}
                                                            className="text-sky-400 hover:underline"
                                                        >
                                                            {item.hostname || serverIdForDisplay(item.agent_id)}
                                                        </Link>
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <Badge
                                                            className={
                                                                item.status === "in_sync"
                                                                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                                    : item.status === "drifted"
                                                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                                    : "bg-red-500/10 text-red-400 border-red-500/20"
                                                            }
                                                        >
                                                            {item.status === "in_sync"
                                                                ? "In sync"
                                                                : item.status === "drifted"
                                                                ? "Drifted"
                                                                : item.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2 px-3 text-neutral-400">
                                                        {item.diff_summary || item.error_message || "—"}
                                                    </td>
                                                    <td>
                                                        {item.diff_content && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setExpandedAgent((prev) =>
                                                                        prev === item.agent_id ? null : item.agent_id
                                                                    )
                                                                }
                                                            >
                                                                {expandedAgent === item.agent_id ? "Hide" : "Diff"}
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                                {expandedAgent === item.agent_id && item.diff_content && (
                                                    <tr>
                                                        <td colSpan={4} className="p-0">
                                                            <pre className="text-xs bg-neutral-950 p-4 overflow-x-auto text-neutral-300 whitespace-pre-wrap border-b border-neutral-800">
                                                                {item.diff_content}
                                                            </pre>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {result.items.length === 0 && (
                                <p className="text-neutral-500 py-4 text-center">No agents in group B.</p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
