/**
 * Theme palette: RGB triplets (space-separated for rgb(var(--theme-*))).
 * Contrast targets: text on background ≥4.5:1 (WCAG AA), textMuted ≥4.5:1,
 * textDim ≥3:1, borders ≥3:1. Semantic colors (primary/success/warning/error)
 * are tuned per theme for readability on surface/background.
 */
export const themes = {
    dark: {
        name: "Dark",
        background: "11 15 25",       // #0B0F19
        surface: "17 24 39",           // #111827
        surfaceLight: "31 41 55",      // #1F2937
        text: "249 250 251",           // #F9FAFB
        textMuted: "203 213 225",      // #CBD5E1
        textDim: "148 163 184",        // #94A3B8
        primary: "59 130 246",         // #3B82F6
        success: "74 222 128",         // #4ADE80
        warning: "253 211 77",         // #FCD34D
        error: "248 113 113",          // #F87171
        border: "55 65 81",            // #374151
    },
    light: {
        name: "Light",
        background: "249 250 251",     // #F9FAFB
        surface: "255 255 255",        // #FFFFFF  (cards)
        surfaceLight: "243 244 246",   // #F3F4F6  (hover)
        text: "17 24 39",              // #111827
        textMuted: "75 85 99",         // #4B5563
        textDim: "156 163 175",        // #9CA3AF
        primary: "37 99 235",          // #2563EB
        success: "22 163 74",          // #16A34A
        warning: "217 119 6",          // #D97706
        error: "220 38 38",            // #DC2626
        border: "229 231 235",         // #E5E7EB
    },
    rocker: {
        name: "Rocker",
        background: "7 13 14",    // #070d0e - Deep Blue-Black
        surface: "18 24 26",       // #12181a - Card Background
        surfaceLight: "28 36 39",
        text: "248 250 252",       // Off-white
        textMuted: "148 163 184",
        textDim: "100 116 139",
        primary: "0 140 255",      // #008cff - Electric Blue
        success: "21 202 32",      // #15ca20 - Success Green
        warning: "255 193 7",      // #ffc107 - Warning Orange
        error: "253 53 80",        // #fd3550 - Danger Red
        border: "32 44 48",
    }
} as const;

export type ThemeName = keyof typeof themes;

/** Ordered list of theme ids for the UI dropdown. */
export const THEME_IDS: ThemeName[] = ["dark", "light", "rocker"];

export function getThemeColors(themeName: ThemeName) {
    return themes[themeName];
}
