"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, FolderKanban, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useProject, Project } from "@/lib/project-context";
import Link from "next/link";

interface ProjectSelectorProps {
  showAllOption?: boolean;
  className?: string;
}

export function ProjectSelector({ showAllOption = true, className }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { projects, selectedProject, selectProject, isLoading, isSuperAdmin } = useProject();

  const handleSelect = (project: Project | null) => {
    selectProject(project);
    setOpen(false);
    setSearchQuery("");
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-[200px] justify-between hover-white-black border-[rgb(var(--theme-border))]",
            className
          )}
          style={{
            background: "rgb(var(--theme-surface))",
            color: "rgb(var(--theme-text))",
          }}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 truncate">
            <FolderKanban className="h-4 w-4 shrink-0 opacity-70" style={{ color: "rgb(var(--theme-text-muted))" }} />
            <span className="truncate">
              {selectedProject ? selectedProject.name : "All Projects"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" style={{ color: "rgb(var(--theme-text-muted))" }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center border-b px-3 py-2" style={{ borderColor: "rgb(var(--theme-border))" }}>
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" style={{ color: "rgb(var(--theme-text-muted))" }} />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-0 p-0 focus-visible:ring-0 bg-transparent"
              style={{ color: "rgb(var(--theme-text))" }}
            />
          </div>
          <div className="max-h-[300px] overflow-auto p-1">
            {showAllOption && isSuperAdmin && (
              <>
                <button
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover-surface",
                    selectedProject === null && "hover-surface"
                  )}
                  style={{
                    color: "rgb(var(--theme-text))",
                    background: selectedProject === null ? "rgb(var(--theme-primary) / 0.15)" : "transparent",
                  }}
                  onClick={() => handleSelect(null)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedProject === null ? "opacity-100" : "opacity-0"
                    )}
                    style={{ color: "rgb(var(--theme-text))" }}
                  />
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
              <>
                <div className="px-2 py-1.5 text-xs font-semibold" style={{ color: "rgb(var(--theme-text-muted))" }}>
                  Projects
                </div>
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover-surface",
                      selectedProject?.id === project.id && "hover-surface"
                    )}
                    style={{
                      color: "rgb(var(--theme-text))",
                      background: selectedProject?.id === project.id ? "rgb(var(--theme-primary) / 0.15)" : "transparent",
                    }}
                    onClick={() => handleSelect(project)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedProject?.id === project.id ? "opacity-100" : "opacity-0"
                      )}
                      style={{ color: "rgb(var(--theme-text))" }}
                    />
                    {project.name}
                  </button>
                ))}
              </>
            )}
            {isSuperAdmin && (
              <>
                <div className="-mx-1 my-1 h-px" style={{ background: "rgb(var(--theme-border))" }} />
                <Link
                  href="/settings/projects"
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
