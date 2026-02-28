export const themes = {
    dark: {
        name: "Dark",
        background: "0 0 0", // Pure black
        surface: "23 23 23", // Dark gray
        surfaceLight: "38 38 38", // Lighter gray
        text: "255 255 255", // White
        textMuted: "180 180 180", // Brighter gray for better contrast
        textDim: "140 140 140", // For less important elements
        primary: "59 130 246", // Blue
        success: "34 197 94", // Green
        warning: "251 191 36", // Amber
        error: "239 68 68", // Red
        border: "55 55 55", // Slightly brighter border
    },
    light: {
        name: "Light",
        background: "255 255 255", // White
        surface: "249 250 251", // Light gray
        surfaceLight: "243 244 246", // Lighter gray
        text: "17 24 39", // Dark gray (#111827)
        textMuted: "55 65 81", // Darker gray for better contrast (gray-700)
        textDim: "107 114 128", // Gray-500 for tertiary text
        primary: "37 99 235", // Blue
        success: "22 163 74", // Green
        warning: "245 158 11", // Amber
        error: "220 38 38", // Red
        border: "209 213 219", // Gray-300 for visible borders
    },
    solarized: {
        name: "Solarized Dark",
        background: "0 43 54", // Base03
        surface: "7 54 66", // Base02
        surfaceLight: "88 110 117", // Base01
        // FIXED: Improved contrast - using Base1/Base2 for better WCAG compliance
        text: "238 232 213", // Base2 - Cream white for maximum contrast
        textMuted: "147 161 161", // Base1 - Brighter secondary text
        textDim: "131 148 150", // Base0 - Original text color for tertiary
        primary: "38 139 210", // Blue
        success: "133 153 0", // Green
        warning: "203 75 22", // Orange (more visible than yellow)
        error: "220 50 47", // Red
        border: "88 110 117", // Base01 - Visible borders
    },
    nord: {
        name: "Nord",
        background: "46 52 64", // Polar Night 0
        surface: "59 66 82", // Polar Night 1
        surfaceLight: "67 76 94", // Polar Night 2
        text: "236 239 244", // Snow Storm 2 (brightest)
        textMuted: "229 233 240", // Snow Storm 1
        textDim: "216 222 233", // Snow Storm 0
        primary: "136 192 208", // Frost 3
        success: "163 190 140", // Aurora Green
        warning: "235 203 139", // Aurora Yellow
        error: "191 97 106", // Aurora Red
        border: "76 86 106", // Polar Night 3 - brighter for visibility
    },
} as const;

export type ThemeName = keyof typeof themes;

export function getThemeColors(themeName: ThemeName) {
    return themes[themeName];
}
