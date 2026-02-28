"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2, Edit2, AlertCircle, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface AlertRule {
    id: string;
    name: string;
    metric_type: string;
    threshold: number;
    comparison: string;
    window_sec: number;
    enabled: boolean;
    recipients: string;
}

export function AlertConfiguration() {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<AlertRule> | null>(null);

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch("/api/alerts");
            const data = await res.json();
            setRules(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch rules:", error);
            toast.error("Failed to load alert rules");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveRule = async () => {
        if (!editingRule?.name || !editingRule?.metric_type) {
            toast.error("Please fill in all required fields");
            return;
        }

        try {
            const res = await apiFetch("/api/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingRule),
            });

            if (res.ok) {
                toast.success(editingRule.id ? "Rule updated" : "Rule created");
                setIsDialogOpen(false);
                fetchRules();
            } else {
                throw new Error("Failed to save rule");
            }
        } catch (error) {
            toast.error("Failed to save alert rule");
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;

        try {
            const res = await apiFetch(`/api/alerts/${id}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Rule deleted");
                fetchRules();
            } else {
                throw new Error("Failed to delete rule");
            }
        } catch (error) {
            toast.error("Failed to delete alert rule");
        }
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Bell className="w-5 h-5 text-indigo-500" />
                        Alert Rules
                    </CardTitle>
                    <CardDescription>Configure metric-based thresholds for notifications</CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setEditingRule({ enabled: true, comparison: 'gt', window_sec: 300 })}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Rule
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingRule?.id ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Rule Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. High CPU Usage"
                                    value={editingRule?.name || ""}
                                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="metric">Metric</Label>
                                    <select
                                        id="metric"
                                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                        value={editingRule?.metric_type || ""}
                                        onChange={(e) => setEditingRule({ ...editingRule, metric_type: e.target.value })}
                                    >
                                        <option value="">Select Metric</option>
                                        <option value="cpu">CPU Usage (%)</option>
                                        <option value="memory">Memory Usage (%)</option>
                                        <option value="rps">Requests Per Second</option>
                                        <option value="error_rate">Error Rate (%)</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="comparison">Comparison</Label>
                                    <select
                                        id="comparison"
                                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                        value={editingRule?.comparison || "gt"}
                                        onChange={(e) => setEditingRule({ ...editingRule, comparison: e.target.value })}
                                    >
                                        <option value="gt">Greater Than</option>
                                        <option value="lt">Less Than</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="threshold">Threshold</Label>
                                    <Input
                                        id="threshold"
                                        type="number"
                                        value={editingRule?.threshold || 0}
                                        onChange={(e) => setEditingRule({ ...editingRule, threshold: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="window">Window (seconds)</Label>
                                    <Input
                                        id="window"
                                        type="number"
                                        value={editingRule?.window_sec || 300}
                                        onChange={(e) => setEditingRule({ ...editingRule, window_sec: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="recipients">Recipients (Email / Webhook)</Label>
                                <Input
                                    id="recipients"
                                    placeholder="admin@example.com, https://webhook.site/..."
                                    value={editingRule?.recipients || ""}
                                    onChange={(e) => setEditingRule({ ...editingRule, recipients: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveRule} className="bg-indigo-600 hover:bg-indigo-700">
                                <Save className="w-4 h-4 mr-2" />
                                Save Rule
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border border-slate-200 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="font-semibold">Rule Name</TableHead>
                                <TableHead className="font-semibold">Condition</TableHead>
                                <TableHead className="font-semibold">Window</TableHead>
                                <TableHead className="font-semibold">Status</TableHead>
                                <TableHead className="text-right font-semibold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">Loading rules...</TableCell>
                                </TableRow>
                            ) : rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <AlertCircle className="w-8 h-8 opacity-20" />
                                            <span>No alert rules defined yet</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rules.map((rule) => (
                                    <TableRow key={rule.id}>
                                        <TableCell className="font-medium">{rule.name}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">
                                                    {rule.metric_type.toUpperCase()}
                                                </Badge>
                                                <span className="text-slate-500">{rule.comparison === 'gt' ? '>' : '<'}</span>
                                                <span className="font-semibold">{rule.threshold}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-600">{rule.window_sec}s</TableCell>
                                        <TableCell>
                                            {rule.enabled ? (
                                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 w-fit">
                                                    <CheckCircle2 className="w-3 h-3" /> Enabled
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 flex items-center gap-1 w-fit">
                                                    Disabled
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                                                    onClick={() => {
                                                        setEditingRule(rule);
                                                        setIsDialogOpen(true);
                                                    }}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-rose-600"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
