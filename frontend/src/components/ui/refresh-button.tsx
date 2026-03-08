"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RefreshButtonProps {
  /** True during initial load or refresh; shows spinner and "Refreshing…" */
  loading?: boolean;
  /** Optional separate refresh state (e.g. user clicked Refresh); combined with loading for display */
  refreshing?: boolean;
  /** Called when the button is clicked; parent should set loading/refreshing and run fetch */
  onRefresh: () => void | Promise<void>;
  /** Disable the button (default: same as loading so initial load disables) */
  disabled?: boolean;
  /** Accessible label */
  "aria-label"?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "ghost";
  className?: string;
  /** Button label when idle (default: "Refresh") */
  label?: string;
  /** Label when loading/refreshing (default: "Refreshing…") */
  loadingLabel?: string;
}

export function RefreshButton({
  loading = false,
  refreshing = false,
  onRefresh,
  disabled,
  "aria-label": ariaLabel = "Refresh",
  size = "sm",
  variant = "outline",
  className,
  label = "Refresh",
  loadingLabel = "Refreshing…",
}: RefreshButtonProps) {
  const isBusy = loading || refreshing;
  const isDisabled = disabled !== undefined ? disabled : loading;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onRefresh}
      disabled={isDisabled}
      aria-label={ariaLabel}
      style={
        variant === "outline"
          ? {
              borderColor: "rgb(var(--theme-border))",
              background: "rgb(var(--theme-surface))",
              color: "rgb(var(--theme-text-muted))",
            }
          : undefined
      }
      className={cn(
        "hover:opacity-90 transition-transform duration-150 active:scale-95 select-none",
        className
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4 mr-2 shrink-0", isBusy && "animate-spin")}
        aria-hidden
      />
      <span className={isBusy ? "opacity-90" : ""}>
        {isBusy ? loadingLabel : label}
      </span>
    </Button>
  );
}
