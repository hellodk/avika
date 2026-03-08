/**
 * Theme palette: RGB triplets (space-separated for rgb(var(--theme-*))).
 * Contrast targets: text on background ≥4.5:1 (WCAG AA), textMuted ≥4.5:1,
 * textDim ≥3:1, borders ≥3:1. Semantic colors (primary/success/warning/error)
 * are tuned per theme for readability on surface/background.
 */
export const themes = {
    dark: {
        name: "Dark",
        background: "0 0 0",
        surface: "26 26 26",
        surfaceLight: "42 42 42",
        text: "255 255 255",
        textMuted: "188 188 188",
        textDim: "150 150 150",
        primary: "59 130 246",
        success: "34 197 94",
        warning: "251 191 36",
        error: "239 68 68",
        border: "64 64 64",
    },
    light: {
        name: "Light",
        background: "255 255 255",
        surface: "249 250 251",
        surfaceLight: "243 244 246",
        text: "17 24 39",
        textMuted: "55 65 81",
        textDim: "107 114 128",
        primary: "37 99 235",
        success: "22 163 74",
        warning: "245 158 11",
        error: "220 38 38",
        border: "209 213 219",
    },
} as const;

export type ThemeName = keyof typeof themes;

/** Ordered list of theme ids for the UI dropdown. */
export const THEME_IDS: ThemeName[] = ["dark", "light"];

export function getThemeColors(themeName: ThemeName) {
    return themes[themeName];
}
