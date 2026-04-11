"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, FolderKanban, Plus, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useProject, Project, Environment } from "@/lib/project-context";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface ProjectSelectorProps {
  showAllOption?: boolean;
  className?: string;
}

export function ProjectSelector({ showAllOption = true, className }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [projectEnvs, setProjectEnvs] = useState<Record<string, Environment[]>>({});
  const {
    projects,
    selectedProject,
    selectedEnvironment,
    selectProject,
    selectEnvironment,
    isLoading,
    isSuperAdmin,
  } = useProject();

  const handleSelectAll = () => {
    selectProject(null);
    setOpen(false);
    setSearchQuery("");
    setExpandedProject(null);
  };

  const handleSelectProject = (project: Project) => {
    selectProject(project);
    // Don't close — expand to show environments
    setExpandedProject(project.id);
    // Fetch environments if not cached
    if (!projectEnvs[project.id]) {
      apiFetch(`/api/projects/${project.id}/environments`)
        .then(r => r.json())
        .then(envs => {
          setProjectEnvs(prev => ({ ...prev, [project.id]: Array.isArray(envs) ? envs : [] }));
        })
        .catch(() => {});
    }
  };

  const handleSelectEnvironment = (project: Project, env: Environment) => {
    selectProject(project);
    selectEnvironment(env);
    setOpen(false);
    setSearchQuery("");
  };

  // Auto-expand selected project
  useEffect(() => {
    if (selectedProject) {
      setExpandedProject(selectedProject.id);
      if (!projectEnvs[selectedProject.id]) {
        apiFetch(`/api/projects/${selectedProject.id}/environments`)
          .then(r => r.json())
          .then(envs => {
            setProjectEnvs(prev => ({ ...prev, [selectedProject.id]: Array.isArray(envs) ? envs : [] }));
          })
          .catch(() => {});
      }
    }
  }, [selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProjects = projects
    .filter(p => p.slug !== "unclassified")
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Display text
  let displayText = "All Projects";
  if (selectedProject && selectedEnvironment) {
    displayText = `${selectedProject.name} / ${selectedEnvironment.name}`;
  } else if (selectedProject) {
    displayText = selectedProject.name;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between hover-white-black border-[rgb(var(--theme-border))]", className)}
          style={{ background: "rgb(var(--theme-surface))", color: "rgb(var(--theme-text))" }}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 truncate">
            <FolderKanban className="h-4 w-4 shrink-0 opacity-70" style={{ color: "rgb(var(--theme-text-muted))" }} />
            <span className="truncate text-sm">{displayText}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" style={{ color: "rgb(var(--theme-text-muted))" }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="flex flex-col">
          {/* Search */}
          <div className="flex items-center border-b px-3 py-2" style={{ borderColor: "rgb(var(--theme-border))" }}>
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" style={{ color: "rgb(var(--theme-text-muted))" }} />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-0 p-0 focus-visible:ring-0 bg-transparent"
              style={{ color: "rgb(var(--theme-text))" }}
            />
          </div>

          <div className="max-h-[400px] overflow-auto p-1">
            {/* All Projects option */}
            {showAllOption && isSuperAdmin && (
              <>
                <button
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover-surface"
                  style={{
                    color: "rgb(var(--theme-text))",
                    background: selectedProject === null ? "rgb(var(--theme-primary) / 0.15)" : "transparent",
                  }}
                  onClick={handleSelectAll}
                >
                  <Check className={cn("mr-2 h-4 w-4", selectedProject === null ? "opacity-100" : "opacity-0")} style={{ color: "rgb(var(--theme-text))" }} />
                  All Projects
                </button>
                <div className="-mx-1 my-1 h-px" style={{ background: "rgb(var(--theme-border))" }} />
              </>
            )}

            {filteredProjects.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                No projects found.
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const isSelected = selectedProject?.id === project.id;
                const envs = projectEnvs[project.id] || [];

                return (
                  <div key={project.id}>
                    {/* Project row */}
                    <button
                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover-surface"
                      style={{
                        color: "rgb(var(--theme-text))",
                        background: isSelected && !selectedEnvironment ? "rgb(var(--theme-primary) / 0.15)" : "transparent",
                      }}
                      onClick={() => handleSelectProject(project)}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} style={{ color: "rgb(var(--theme-text))" }} />
                      <span className="flex-1 text-left truncate">{project.name}</span>
                      <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isExpanded && "rotate-90")} style={{ color: "rgb(var(--theme-text-muted))" }} />
                    </button>

                    {/* Environments sub-menu (indented) */}
                    {isExpanded && (
                      <div className="ml-4 border-l pl-2 my-0.5" style={{ borderColor: "rgb(var(--theme-border))" }}>
                        {/* All environments in this project */}
                        <button
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1 text-xs outline-none transition-colors hover-surface"
                          style={{
                            color: "rgb(var(--theme-text-muted))",
                            background: isSelected && !selectedEnvironment ? "rgb(var(--theme-primary) / 0.1)" : "transparent",
                          }}
                          onClick={() => { selectProject(project); selectEnvironment(null as any); setOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-3 w-3", isSelected && !selectedEnvironment ? "opacity-100" : "opacity-0")} />
                          All environments
                        </button>

                        {envs.filter(e => e.slug !== "unclassified").map((env) => {
                          const isEnvSelected = selectedEnvironment?.id === env.id;
                          return (
                            <button
                              key={env.id}
                              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1 text-xs outline-none transition-colors hover-surface"
                              style={{
                                color: isEnvSelected ? "rgb(var(--theme-text))" : "rgb(var(--theme-text-muted))",
                                background: isEnvSelected ? "rgb(var(--theme-primary) / 0.15)" : "transparent",
                              }}
                              onClick={() => handleSelectEnvironment(project, env)}
                            >
                              <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: env.color || "#6366f1" }} />
                              <span className="flex-1 text-left truncate">{env.name}</span>
                              {env.is_production && (
                                <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-500 ml-1">PROD</span>
                              )}
                              {isEnvSelected && <Check className="h-3 w-3 ml-1 shrink-0" />}
                            </button>
                          );
                        })}

                        {envs.length === 0 && (
                          <div className="px-2 py-1 text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                            No environments
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Manage Projects link */}
            {isSuperAdmin && (
              <>
                <div className="-mx-1 my-1 h-px" style={{ background: "rgb(var(--theme-border))" }} />
                <Link
                  href="/settings?tab=projects"
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover-surface"
                  style={{ color: "rgb(var(--theme-text))" }}
                  onClick={() => setOpen(false)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Manage Projects
                </Link>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
