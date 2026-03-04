import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Palette, Check, Moon, Sun, Sparkles, ChevronDown, Building2, Eclipse } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { themes, ThemeName } from "@/lib/themes";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themeIcons: Record<string, typeof Moon> = {
    dark: Moon,
    light: Sun,
    solarized: Sparkles,
    nord: Sparkles,
    corporate: Building2,
    midnight: Eclipse,
};

export function AppearanceSettings() {
    const { theme, setTheme } = useTheme();
    const ActiveThemeIcon = themeIcons[theme as ThemeName] || Palette;
    const activeThemeName = themes[theme as ThemeName]?.name || "Select Theme";

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
                <div className="space-y-2">
                    <Label style={{ color: 'rgb(var(--theme-text))' }}>Active Theme</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-[240px] justify-between"
                                style={{
                                    backgroundColor: 'rgb(var(--theme-surface-light))',
                                    color: 'rgb(var(--theme-text))',
                                    borderColor: 'rgb(var(--theme-border))'
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <ActiveThemeIcon className="h-4 w-4" />
                                    <span>{activeThemeName}</span>
                                </div>
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className="w-[240px]"
                            style={{
                                backgroundColor: 'rgb(var(--theme-surface))',
                                borderColor: 'rgb(var(--theme-border))'
                            }}
                        >
                            {Object.entries(themes).map(([key, themeConfig]) => {
                                const Icon = themeIcons[key as ThemeName] || Palette;
                                const isActive = theme === key;
                                return (
                                    <DropdownMenuItem
                                        key={key}
                                        onClick={() => setTheme(key as ThemeName)}
                                        className="flex items-center justify-between cursor-pointer"
                                        style={{ color: 'rgb(var(--theme-text))' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            <span>{themeConfig.name}</span>
                                        </div>
                                        {isActive && <Check className="h-4 w-4 text-blue-500" />}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    );
}
