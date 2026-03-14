"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Wrench, Plus, RefreshCw, Trash2, Edit2, Play, Square, Clock,
    Layout, CheckCircle2, AlertTriangle, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { MaintenanceDialog } from "@/components/maintenance-dialog";

function MaintenancePageContent() {
    const { selectedProject } = useProject();
    const [templates, setTemplates] = useState<any[]>([]);
    const [states, setStates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("templates");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

    const fetchTemplates = useCallback(async () => {
        if (!selectedProject) return;
        setLoading(true);
        try {
            const res = await apiFetch(`/api/maintenance/templates?project_id=${selectedProject.id}`);
            if (!res.ok) throw new Error("Failed to fetch templates");
            const data = await res.json();
            setTemplates(data || []);
        } catch (err: any) {
            toast.error("Failed to load templates", { description: err.message });
        } finally {
            setLoading(false);
        }
    }, [selectedProject]);

    const fetchStates = useCallback(async () => {
        try {
            const res = await apiFetch('/api/maintenance/states');
            if (!res.ok) throw new Error("Failed to fetch maintenance states");
            const data = await res.json();
            setStates(data || []);
        } catch (err: any) {
            console.error("Failed to load states:", err);
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
        fetchStates();
    }, [fetchTemplates, fetchStates]);

    const handleCreateTemplate = () => {
        setSelectedTemplate(null);
        setIsDialogOpen(true);
    };

    const handleEditTemplate = (template: any) => {
        setSelectedTemplate(template);
        setIsDialogOpen(true);
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm("Are you sure you want to delete this template?")) return;
        
        try {
            const res = await apiFetch(`/api/maintenance/templates?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Failed to delete template");
            toast.success("Template deleted successfully");
            fetchTemplates();
        } catch (err: any) {
            toast.error("Error", { description: err.message });
        }
    };

    const handleDisableMaintenance = async (scope: string, scope_id: string) => {
        try {
            const res = await apiFetch('/api/maintenance/set', {
                method: 'POST',
                body: JSON.stringify({
                    scope,
                    scope_id,
                    active: false,
                }),
            });
            if (!res.ok) throw new Error("Failed to disable maintenance");
            toast.success("Maintenance disabled");
            fetchStates();
        } catch (err: any) {
            toast.error("Error", { description: err.message });
        }
    };

    return (
        <div className="space-y-6">
            <MaintenanceDialog 
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                template={selectedTemplate}
                onSuccess={() => {
                    fetchTemplates();
                }}
                projectId={selectedProject?.id}
            />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[rgb(var(--theme-text))]">Maintenance Mode</h1>
                    <p className="text-sm text-[rgb(var(--theme-text-muted))]">
                        Orchestrate maintenance windows and manage custom downtime pages.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <RefreshButton 
                        loading={loading} 
                        onRefresh={() => { fetchTemplates(); fetchStates(); }}
                        aria-label="Refresh maintenance data"
                    />
                    <Button 
                        className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
                        onClick={handleCreateTemplate}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Template
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-[rgb(var(--theme-surface))] border-[rgb(var(--theme-border))] border">
                    <TabsTrigger value="templates" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                        <Layout className="h-4 w-4 mr-2" />
                        Templates
                    </TabsTrigger>
                    <TabsTrigger value="active" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                        <Play className="h-4 w-4 mr-2" />
                        Active Windows ({states.filter(s => s.active).length})
                    </TabsTrigger>
                    <TabsTrigger value="scheduled" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                        <Clock className="h-4 w-4 mr-2" />
                        Scheduled
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="templates" className="mt-6">
                    <Card className="bg-[rgb(var(--theme-surface))] border-[rgb(var(--theme-border))] border-none shadow-xl overflow-hidden">
                        <CardHeader className="border-b border-[rgb(var(--theme-border))] bg-white/[0.02]">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Layout className="h-5 w-5 text-amber-500" />
                                Maintenance Templates
                            </CardTitle>
                            <CardDescription>
                                Built-in and custom HTML templates for your maintenance pages.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-[rgb(var(--theme-border))]">
                                        <TableHead className="w-[250px]">Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="w-[100px]">Default</TableHead>
                                        <TableHead className="w-[100px]">Type</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {templates.length === 0 && !loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-[rgb(var(--theme-text-muted))]">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Info className="h-8 w-8 opacity-20" />
                                                    <p>No templates found. Create one to get started.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        templates.map((template) => (
                                            <TableRow key={template.id} className="border-[rgb(var(--theme-border))] hover:bg-white/[0.02] transition-colors">
                                                <TableCell className="font-medium text-[rgb(var(--theme-text))]">
                                                    {template.name}
                                                </TableCell>
                                                <TableCell className="text-[rgb(var(--theme-text-muted))] text-sm">
                                                    {template.description || "No description"}
                                                </TableCell>
                                                <TableCell>
                                                    {template.is_default ? (
                                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-none">Default</Badge>
                                                    ) : (
                                                        <span className="text-xs text-[rgb(var(--theme-text-muted))]">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {template.is_built_in ? (
                                                        <Badge variant="outline" className="border-blue-500/50 text-blue-400">System</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-[rgb(var(--theme-border))] text-[rgb(var(--theme-text-muted))]">Custom</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="h-8 w-8 hover:bg-white/10"
                                                            onClick={() => handleEditTemplate(template)}
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        {!template.is_built_in && (
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-8 w-8 hover:bg-red-500/10 text-red-400"
                                                                onClick={() => handleDeleteTemplate(template.id)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="active" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {states.filter(s => s.active).length === 0 ? (
                            <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-[rgb(var(--theme-border))] rounded-xl text-[rgb(var(--theme-text-muted))]">
                                <Play className="h-10 w-10 mb-2 opacity-10" />
                                <p>No active maintenance windows</p>
                            </div>
                        ) : (
                            states.filter(s => s.active).map((state) => (
                                <Card key={`${state.scope}-${state.scope_id}`} className="bg-[rgb(var(--theme-surface))] border-[rgb(var(--theme-border))] border-none shadow-xl border-t-4 border-t-amber-500">
                                    <CardContent className="pt-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-amber-500/10">
                                                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-[rgb(var(--theme-text))] text-lg leading-tight uppercase">
                                                        {state.scope_id}
                                                    </h3>
                                                    <p className="text-xs text-[rgb(var(--theme-text-muted))]">Scope: {state.scope}</p>
                                                </div>
                                            </div>
                                            <Badge className="bg-amber-500 text-black animate-pulse">Live</Badge>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-[rgb(var(--theme-text-muted))]">Reason:</span>
                                                <span className="text-[rgb(var(--theme-text))]">{state.reason || "Downtime"}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-[rgb(var(--theme-text-muted))]">Template:</span>
                                                <span className="text-blue-400 font-medium">{state.template_id?.substring(0, 8)}...</span>
                                            </div>
                                            <div className="pt-4 flex gap-2">
                                                <Button 
                                                    variant="destructive" 
                                                    className="flex-1 bg-red-500/10 border border-red-500/50 hover:bg-red-500 text-red-500 hover:text-white"
                                                    onClick={() => handleDisableMaintenance(state.scope, state.scope_id)}
                                                >
                                                    <Square className="h-4 w-4 mr-2" />
                                                    Disable
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="scheduled" className="mt-6">
                    <Card className="bg-[rgb(var(--theme-surface))] border-[rgb(var(--theme-border))] border-none shadow-xl p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="p-4 rounded-full bg-blue-500/10">
                                <Clock className="h-10 w-10 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-[rgb(var(--theme-text))]">No upcoming maintenance</h3>
                                <p className="text-[rgb(var(--theme-text-muted))] mt-1">
                                    Schedule future downtime for automated orchestration.
                                </p>
                            </div>
                            <Button className="mt-2 bg-blue-500 hover:bg-blue-600 text-white font-medium">
                                Schedule Window
                            </Button>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// Full page container with skeleton
export default function MaintenancePage() {
    return (
        <Suspense fallback={
            <div className="animate-pulse space-y-6">
                <div className="h-12 w-64 bg-white/5 rounded-lg" />
                <div className="h-[400px] w-full bg-white/5 rounded-xl" />
            </div>
        }>
            <MaintenancePageContent />
        </Suspense>
    );
}
