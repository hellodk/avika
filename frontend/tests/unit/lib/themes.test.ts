import { describe, it, expect } from 'vitest';
import { themes, getThemeColors, ThemeName } from '@/lib/themes';

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

        it('should have solarized theme defined', () => {
            expect(themes.solarized).toBeDefined();
            expect(themes.solarized.name).toBe('Solarized Dark');
        });

        it('should have nord theme defined', () => {
            expect(themes.nord).toBeDefined();
            expect(themes.nord.name).toBe('Nord');
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

        it('should return solarized theme colors', () => {
            const colors = getThemeColors('solarized');
            expect(colors).toEqual(themes.solarized);
        });

        it('should return nord theme colors', () => {
            const colors = getThemeColors('nord');
            expect(colors).toEqual(themes.nord);
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
