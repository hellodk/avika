"use client";

import { cn } from "@/lib/utils";
import { useProject, Environment } from "@/lib/project-context";
import { Badge } from "@/components/ui/badge";

interface EnvironmentTabsProps {
  className?: string;
}

const environmentColors: Record<string, { bg: string; text: string; badge: string }> = {
  "#ef4444": { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", badge: "destructive" },
  "#eab308": { bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300", badge: "warning" },
  "#22c55e": { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", badge: "success" },
  "#3b82f6": { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", badge: "default" },
  "#a855f7": { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-300", badge: "secondary" },
  "#6b7280": { bg: "bg-gray-50 dark:bg-gray-950/30", text: "text-gray-700 dark:text-gray-300", badge: "outline" },
};

function getEnvironmentStyle(color: string) {
  return environmentColors[color] || environmentColors["#6b7280"];
}

export function EnvironmentTabs({ className }: EnvironmentTabsProps) {
  const { environments, selectedEnvironment, selectEnvironment, selectedProject, isLoading } = useProject();

  if (!selectedProject || environments.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 overflow-x-auto", className)}>
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto pb-1", className)}>
      {environments.map((env) => {
        const style = getEnvironmentStyle(env.color);
        const isSelected = selectedEnvironment?.id === env.id;
        
        return (
          <button
            key={env.id}
            onClick={() => selectEnvironment(env)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              isSelected && style.bg,
              isSelected && style.text,
              !isSelected && "text-muted-foreground"
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: env.color }}
            />
            {env.name}
            {env.is_production && (
              <Badge variant="outline" className="h-4 text-[10px] px-1">
                PROD
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface EnvironmentBadgeProps {
  environment?: Environment;
  name?: string;
  color?: string;
  size?: "sm" | "md";
  small?: boolean;
}

export function EnvironmentBadge({ environment, name, color, size = "md", small }: EnvironmentBadgeProps) {
  const displayName = environment?.name || name || "Unknown";
  const displayColor = environment?.color || color || "#6b7280";
  const effectiveSize = small ? "sm" : size;
  
  return (
    <div className={cn("flex items-center gap-1.5", effectiveSize === "sm" ? "text-xs" : "text-sm")}>
      <span
        className={cn("rounded-full", effectiveSize === "sm" ? "h-1.5 w-1.5" : "h-2 w-2")}
        style={{ backgroundColor: displayColor }}
      />
      <span className="text-muted-foreground">{displayName}</span>
    </div>
  );
}
