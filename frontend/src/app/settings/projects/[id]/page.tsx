"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  Layers,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useProject, Project, Environment } from "@/lib/project-context";

const PRESET_COLORS = [
  "#ef4444", // red - production
  "#f97316", // orange
  "#eab308", // yellow - staging
  "#22c55e", // green
  "#10b981", // emerald
  "#3b82f6", // blue - dev
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

interface EnvForm {
  name: string;
  description: string;
  color: string;
  is_production: boolean;
  sort_order: number;
}

const emptyEnvForm: EnvForm = {
  name: "",
  description: "",
  color: PRESET_COLORS[5]!,
  is_production: false,
  sort_order: 0,
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;
  const { refreshProjects } = useProject();

  const [project, setProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Project edit state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Environment dialog state
  const [envDialogOpen, setEnvDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [envForm, setEnvForm] = useState<EnvForm>(emptyEnvForm);
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [projRes, envsRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}`, { credentials: "include" }),
        apiFetch(`/api/projects/${projectId}/environments`, {
          credentials: "include",
        }),
      ]);

      if (projRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (!projRes.ok) throw new Error("Failed to load project");

      const projData: Project = await projRes.json();
      setProject(projData);
      setProjectName(projData.name);
      setProjectDescription(projData.description || "");

      if (envsRes.ok) {
        const envData = await envsRes.json();
        setEnvironments(envData || []);
      } else {
        setEnvironments([]);
      }
    } catch (err) {
      console.error("Failed to load project detail:", err);
      toast.error("Failed to load project");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveProject = async () => {
    if (!projectId) return;
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }
    setIsSavingProject(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save project");
      }
      toast.success("Project updated");
      await Promise.all([fetchData(), refreshProjects()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setIsSavingProject(false);
    }
  };

  const openCreateEnvDialog = () => {
    setEditingEnv(null);
    setEnvForm({
      ...emptyEnvForm,
      sort_order: environments.length,
    });
    setEnvDialogOpen(true);
  };

  const openEditEnvDialog = (env: Environment) => {
    setEditingEnv(env);
    setEnvForm({
      name: env.name,
      description: env.description || "",
      color: env.color,
      is_production: env.is_production,
      sort_order: env.sort_order,
    });
    setEnvDialogOpen(true);
  };

  const handleSaveEnv = async () => {
    if (!projectId) return;
    if (!envForm.name.trim()) {
      toast.error("Environment name is required");
      return;
    }
    setIsSavingEnv(true);
    try {
      const url = editingEnv
        ? `/api/environments/${editingEnv.id}`
        : `/api/projects/${projectId}/environments`;
      const method = editingEnv ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(envForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save environment");
      }
      toast.success(editingEnv ? "Environment updated" : "Environment created");
      setEnvDialogOpen(false);
      await Promise.all([fetchData(), refreshProjects()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save environment"
      );
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleDeleteEnv = async (env: Environment) => {
    if (
      !confirm(
        `Delete environment "${env.name}"? Servers assigned to it will become unassigned.`
      )
    ) {
      return;
    }
    try {
      const res = await apiFetch(`/api/environments/${env.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete environment");
      toast.success("Environment deleted");
      await Promise.all([fetchData(), refreshProjects()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete environment"
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 w-1/3 bg-muted rounded" />
            <div className="h-4 w-2/3 bg-muted rounded mt-2" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/settings/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to projects
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Project not found</p>
            <p className="text-sm text-muted-foreground">
              It may have been deleted or you may not have access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to projects
        </Link>
        <h1
          className="text-2xl font-bold mt-2"
          style={{ color: "rgb(var(--theme-text))" }}
        >
          {project.name}
        </h1>
        <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
          @{project.slug}
        </p>
      </div>

      {/* Project details */}
      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Update the project name and description.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Describe the project..."
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveProject} disabled={isSavingProject}>
              <Save className="mr-2 h-4 w-4" />
              {isSavingProject ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Environments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Environments
              </CardTitle>
              <CardDescription>
                Group servers by environment (production, staging, etc.).
              </CardDescription>
            </div>
            <Button onClick={openCreateEnvDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add environment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {environments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Layers className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No environments yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first environment to start assigning servers.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {environments
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((env) => (
                  <div
                    key={env.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: env.color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{env.name}</span>
                          {env.is_production && (
                            <Badge variant="destructive" className="text-xs">
                              Production
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            @{env.slug}
                          </span>
                        </div>
                        {env.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {env.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditEnvDialog(env)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-500"
                        onClick={() => handleDeleteEnv(env)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Environment dialog */}
      <Dialog open={envDialogOpen} onOpenChange={setEnvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEnv ? "Edit environment" : "New environment"}
            </DialogTitle>
            <DialogDescription>
              Environments group servers within this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name">Name</Label>
              <Input
                id="env-name"
                placeholder="e.g., Production"
                value={envForm.name}
                onChange={(e) =>
                  setEnvForm({ ...envForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-description">Description (optional)</Label>
              <Textarea
                id="env-description"
                placeholder="Describe this environment..."
                value={envForm.description}
                onChange={(e) =>
                  setEnvForm({ ...envForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEnvForm({ ...envForm, color })}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      envForm.color === color
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="env-production" className="text-sm font-medium">
                  Production environment
                </Label>
                <p className="text-xs text-muted-foreground">
                  Mark this as a production environment for visual indicators.
                </p>
              </div>
              <Switch
                id="env-production"
                checked={envForm.is_production}
                onCheckedChange={(checked) =>
                  setEnvForm({ ...envForm, is_production: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEnvDialogOpen(false)}
              disabled={isSavingEnv}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEnv} disabled={isSavingEnv}>
              {isSavingEnv
                ? "Saving..."
                : editingEnv
                ? "Save changes"
                : "Create environment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
