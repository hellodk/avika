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
    /** Default light — pure white base, blue primary. */
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
    /**
     * UI Kit — Figma Dashboard UI Kit style: cool slate page background, white cards, indigo primary.
     * Reference: https://www.figma.com/community/file/1210542873091115123/dashboard-ui-kit-dashboard-free-admin-dashboard
     */
    dashboard: {
        name: "UI Kit",
        background: "241 245 249",
        surface: "255 255 255",
        surfaceLight: "226 232 240",
        text: "15 23 42",
        textMuted: "71 85 105",
        textDim: "100 116 139",
        primary: "99 102 241",
        success: "34 197 94",
        warning: "245 158 11",
        error: "239 68 68",
        border: "203 213 225",
    },
    /**
     * Rocker — Bootstrap 5 style: #f8f9fa page, white surfaces, Bootstrap blue primary, neutral gray borders.
     * Reference: https://codervent.com/rocker/demo/vertical/index.html
     */
    rocker: {
        name: "Rocker",
        background: "248 249 250",
        surface: "255 255 255",
        surfaceLight: "233 236 239",
        text: "33 37 41",
        textMuted: "108 117 125",
        textDim: "108 117 125",
        primary: "13 110 253",
        success: "25 135 84",
        warning: "255 193 7",
        error: "220 53 69",
        border: "222 226 230",
    },
} as const;

export type ThemeName = keyof typeof themes;

/** Explicit ordered list of theme ids for the UI dropdown. Ensures all themes always appear. */
export const THEME_IDS: ThemeName[] = ["dark", "light", "dashboard", "rocker"];

export function getThemeColors(themeName: ThemeName) {
    return themes[themeName];
}
