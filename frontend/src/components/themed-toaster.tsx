"use client";

import { useTheme } from "@/lib/theme-provider";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
    const { theme } = useTheme();

    // Map our themes to sonner's supported ones (light, dark, system)
    const sonnerTheme = (theme === "light") ? "light" : "dark";

    return (
        <SonnerToaster
            position="top-right"
            richColors
            closeButton
            theme={sonnerTheme}
        />
    );
}
