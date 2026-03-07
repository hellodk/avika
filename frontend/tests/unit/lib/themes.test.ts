import { describe, it, expect } from 'vitest';
import { themes, getThemeColors, ThemeName, THEME_IDS } from '@/lib/themes';

describe('themes', () => {
    describe('theme definitions', () => {
        it('should have dark theme defined', () => {
            expect(themes.dark).toBeDefined();
            expect(themes.dark.name).toBe('Dark');
        });

        it('should have light theme defined', () => {
            expect(themes.light).toBeDefined();
            expect(themes.light.name).toBe('Light');
        });

        it('should have dashboard (UI Kit) theme defined', () => {
            expect(themes.dashboard).toBeDefined();
            expect(themes.dashboard.name).toBe('UI Kit');
        });

        it('should have rocker theme defined', () => {
            expect(themes.rocker).toBeDefined();
            expect(themes.rocker.name).toBe('Rocker');
        });

        it('THEME_IDS should include all theme keys including dashboard and rocker', () => {
            expect(THEME_IDS).toContain('dashboard');
            expect(THEME_IDS).toContain('rocker');
            expect(THEME_IDS).toEqual(expect.arrayContaining(['dark', 'light', 'dashboard', 'rocker']));
            THEME_IDS.forEach((id) => {
                expect(themes[id as ThemeName]).toBeDefined();
            });
        });
    });

    describe('theme color properties', () => {
        const requiredProperties = [
            'background',
            'surface',
            'surfaceLight',
            'text',
            'textMuted',
            'primary',
            'success',
            'warning',
            'error',
            'border',
        ];

        Object.keys(themes).forEach((themeName) => {
            describe(`${themeName} theme`, () => {
                requiredProperties.forEach((prop) => {
                    it(`should have ${prop} color defined`, () => {
                        const theme = themes[themeName as ThemeName];
                        expect(theme[prop as keyof typeof theme]).toBeDefined();
                        expect(typeof theme[prop as keyof typeof theme]).toBe('string');
                    });
                });
            });
        });
    });

    describe('getThemeColors', () => {
        it('should return dark theme colors', () => {
            const colors = getThemeColors('dark');
            expect(colors).toEqual(themes.dark);
        });

        it('should return light theme colors', () => {
            const colors = getThemeColors('light');
            expect(colors).toEqual(themes.light);
        });

        it('should return dashboard theme colors', () => {
            const colors = getThemeColors('dashboard');
            expect(colors).toEqual(themes.dashboard);
        });

        it('should return rocker theme colors', () => {
            const colors = getThemeColors('rocker');
            expect(colors).toEqual(themes.rocker);
        });
    });

    describe('color format validation', () => {
        it('should have RGB format colors (space-separated values)', () => {
            Object.values(themes).forEach((theme) => {
                // RGB values should be space-separated numbers
                const rgbPattern = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;
                expect(theme.background).toMatch(rgbPattern);
                expect(theme.text).toMatch(rgbPattern);
                expect(theme.primary).toMatch(rgbPattern);
            });
        });
    });

    describe('dark theme specific', () => {
        it('should have pure black background', () => {
            expect(themes.dark.background).toBe('0 0 0');
        });

        it('should have white text', () => {
            expect(themes.dark.text).toBe('255 255 255');
        });
    });

    describe('light theme specific', () => {
        it('should have white background', () => {
            expect(themes.light.background).toBe('255 255 255');
        });

        it('should have dark text', () => {
            expect(themes.light.text).toBe('17 24 39');
        });
    });
});
