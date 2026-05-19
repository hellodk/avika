import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Palette, Check, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { themes, ThemeName, THEME_IDS } from "@/lib/themes";

const themeIcons: Record<string, typeof Moon> = {
    dark: Moon,
    light: Sun,
};

export function AppearanceSettings() {
    const { theme, setTheme } = useTheme();

    return (
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-blue-500" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Appearance</CardTitle>
                </div>
                <p className="text-sm mt-1" style={{ color: 'rgb(var(--theme-text-muted))' }}>Choose your preferred interface theme</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <Label style={{ color: 'rgb(var(--theme-text))' }}>Active Theme</Label>
                    {/* Visual theme cards — click to preview and apply */}
                    <div className="grid grid-cols-3 gap-3">
                        {THEME_IDS.map((key) => {
                            const themeConfig = themes[key];
                            if (!themeConfig) return null;
                            const Icon = themeIcons[key] || Palette;
                            const isActive = theme === key;
                            const bg = `rgb(${themeConfig.background})`;
                            const surface = `rgb(${themeConfig.surface})`;
                            const text = `rgb(${themeConfig.text})`;
                            const muted = `rgb(${themeConfig.textMuted})`;
                            const primary = `rgb(${themeConfig.primary})`;
                            const border = `rgb(${themeConfig.border})`;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setTheme(key)}
                                    className={`relative rounded-lg border-2 overflow-hidden transition-all ${isActive ? 'ring-2 ring-offset-2' : 'hover:scale-105'}`}
                                    style={{
                                        borderColor: isActive ? `rgb(${themeConfig.primary})` : border,
                                    }}
                                    title={`Apply ${themeConfig.name} theme`}
                                >
                                    {/* Mini preview */}
                                    <div style={{ background: bg, padding: '8px' }}>
                                        {/* Fake sidebar */}
                                        <div className="flex gap-1 mb-1">
                                            <div style={{ background: surface, borderRadius: 3, width: 20, height: 36, border: `1px solid ${border}` }}>
                                                <div style={{ background: primary, borderRadius: 2, height: 5, margin: 3 }} />
                                                <div style={{ background: muted, opacity: 0.4, borderRadius: 2, height: 3, margin: '2px 3px' }} />
                                                <div style={{ background: muted, opacity: 0.4, borderRadius: 2, height: 3, margin: '2px 3px' }} />
                                            </div>
                                            {/* Fake content */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ background: surface, borderRadius: 3, height: 36, border: `1px solid ${border}`, padding: 4 }}>
                                                    <div style={{ background: text, opacity: 0.8, borderRadius: 2, height: 4, marginBottom: 3, width: '60%' }} />
                                                    <div style={{ background: muted, opacity: 0.5, borderRadius: 2, height: 3, width: '80%' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Label */}
                                    <div className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium" style={{ color: 'rgb(var(--theme-text))' }}>
                                        <Icon className="h-3 w-3" />
                                        {themeConfig.name}
                                        {isActive && <Check className="h-3 w-3" style={{ color: `rgb(${themeConfig.primary})` }} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

