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
          className={cn("w-[200px] justify-between", className)}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 truncate">
            <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedProject ? selectedProject.name : "All Projects"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-0 p-0 focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[300px] overflow-auto p-1">
            {showAllOption && isSuperAdmin && (
              <>
                <button
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    selectedProject === null && "bg-accent"
                  )}
                  onClick={() => handleSelect(null)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedProject === null ? "opacity-100" : "opacity-0"
                    )}
                  />
                  All Projects
                </button>
                <div className="-mx-1 my-1 h-px bg-muted" />
              </>
            )}
            {filteredProjects.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No projects found.
              </div>
            ) : (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Projects
                </div>
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                      selectedProject?.id === project.id && "bg-accent"
                    )}
                    onClick={() => handleSelect(project)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedProject?.id === project.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {project.name}
                  </button>
                ))}
              </>
            )}
            {isSuperAdmin && (
              <>
                <div className="-mx-1 my-1 h-px bg-muted" />
                <Link
                  href="/settings/projects"
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
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
