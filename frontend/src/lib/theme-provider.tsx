"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeName, getThemeColors } from "./themes";

interface ThemeContextType {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeName>("dark");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedTheme = localStorage.getItem("theme") as ThemeName;
        if (savedTheme) {
            setThemeState(savedTheme);
        }
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const colors = getThemeColors(theme);
        const root = document.documentElement;

        // Apply theme colors as CSS variables
        root.style.setProperty("--theme-background", colors.background);
        root.style.setProperty("--theme-surface", colors.surface);
        root.style.setProperty("--theme-surface-light", colors.surfaceLight);
        root.style.setProperty("--theme-text", colors.text);
        root.style.setProperty("--theme-text-muted", colors.textMuted);
        root.style.setProperty("--theme-text-dim", colors.textDim);
        root.style.setProperty("--theme-primary", colors.primary);
        root.style.setProperty("--theme-success", colors.success);
        root.style.setProperty("--theme-warning", colors.warning);
        root.style.setProperty("--theme-error", colors.error);
        root.style.setProperty("--theme-border", colors.border);

        // Set data-theme attribute for CSS selectors
        root.setAttribute("data-theme", theme);

        localStorage.setItem("theme", theme);
    }, [theme, mounted]);

    const setTheme = (newTheme: ThemeName) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
