"use client";

import { useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subMinutes, subHours, subDays, startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";

export interface TimeRange {
    type: 'relative' | 'absolute';
    value?: string;
    from?: Date;
    to?: Date;
    label?: string;
}

interface TimeRangePickerProps {
    value: TimeRange;
    onChange: (range: TimeRange) => void;
}

const QUICK_RANGES = [
    { value: "5m", label: "Last 5 minutes" },
    { value: "15m", label: "Last 15 minutes" },
    { value: "30m", label: "Last 30 minutes" },
    { value: "1h", label: "Last 1 hour" },
    { value: "3h", label: "Last 3 hours" },
    { value: "6h", label: "Last 6 hours" },
    { value: "12h", label: "Last 12 hours" },
    { value: "24h", label: "Last 24 hours" },
    { value: "2d", label: "Last 2 days" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

const ABSOLUTE_RANGES = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "thisweek", label: "This week" },
    { value: "lastweek", label: "Last week" },
    { value: "thismonth", label: "This month" },
    { value: "lastmonth", label: "Last month" },
];

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
    const [open, setOpen] = useState(false);
    const [customFrom, setCustomFrom] = useState<string>("");
    const [customTo, setCustomTo] = useState<string>("");

    const handleQuickRange = (rangeValue: string, label: string) => {
        onChange({ type: 'relative', value: rangeValue, label });
        setOpen(false);
    };

    const handleAbsoluteRange = (rangeValue: string, label: string) => {
        const now = new Date();
        let from: Date;
        let to: Date = now;

        switch (rangeValue) {
            case "today":
                from = startOfDay(now);
                break;
            case "yesterday":
                from = startOfDay(subDays(now, 1));
                to = endOfDay(subDays(now, 1));
                break;
            case "thisweek":
                from = startOfWeek(now);
                break;
            case "lastweek":
                from = startOfWeek(subDays(now, 7));
                to = endOfDay(subDays(startOfWeek(now), 1));
                break;
            case "thismonth":
                from = startOfMonth(now);
                break;
            case "lastmonth":
                from = startOfMonth(subDays(startOfMonth(now), 1));
                to = endOfDay(subDays(startOfMonth(now), 1));
                break;
            default:
                from = startOfDay(now);
        }

        onChange({ type: 'absolute', value: rangeValue, from, to, label });
        setOpen(false);
    };

    const handleCustomRange = () => {
        if (customFrom && customTo) {
            const from = new Date(customFrom);
            const to = new Date(customTo);
            onChange({
                type: 'absolute',
                from,
                to,
                label: `${format(from, "MMM d, HH:mm")} - ${format(to, "MMM d, HH:mm")}`
            });
            setOpen(false);
        }
    };

    const displayLabel = value.label || "Select time range";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="font-medium text-sm"
                    style={{ 
                        background: "rgb(var(--theme-surface))", 
                        color: "rgb(var(--theme-text))", 
                        borderColor: "rgb(var(--theme-border))" 
                    }}
                >
                    <Clock className="h-4 w-4 mr-2" style={{ color: "rgb(var(--theme-text-muted))" }} />
                    {displayLabel}
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-[500px] p-0" 
                align="end"
                style={{ 
                    background: "rgb(var(--theme-background))", 
                    borderColor: "rgb(var(--theme-border))" 
                }}
            >
                <Tabs defaultValue="quick" className="w-full">
                    <TabsList 
                        className="w-full grid grid-cols-2 rounded-none border-b"
                        style={{ borderColor: "rgb(var(--theme-border))" }}
                    >
                        <TabsTrigger value="quick">Quick ranges</TabsTrigger>
                        <TabsTrigger value="absolute">Absolute time</TabsTrigger>
                    </TabsList>

                    <TabsContent value="quick" className="p-4 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold mb-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    RELATIVE
                                </p>
                                {QUICK_RANGES.map((range) => {
                                    const isLast24h = range.value === "24h";
                                    const isSelected = value.value === range.value;

                                    return (
                                        <button
                                            key={range.value}
                                            onClick={() => handleQuickRange(range.value, range.label)}
                                            className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all ${isSelected
                                                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                                                    : isLast24h
                                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 font-medium hover:bg-blue-500/20'
                                                        : ''
                                                }`}
                                            style={!isSelected && !isLast24h ? { 
                                                color: "rgb(var(--theme-text))", 
                                                background: "transparent" 
                                            } : undefined}
                                        >
                                            {range.label}
                                            {isLast24h && !isSelected && (
                                                <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                    Suggested
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold mb-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    ABSOLUTE
                                </p>
                                {ABSOLUTE_RANGES.map((range) => (
                                    <button
                                        key={range.value}
                                        onClick={() => handleAbsoluteRange(range.value, range.label)}
                                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all ${value.value === range.value
                                            ? 'bg-blue-600 text-white font-semibold shadow-sm'
                                            : ''
                                            }`}
                                        style={value.value !== range.value ? { color: "rgb(var(--theme-text))" } : undefined}
                                    >
                                        {range.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="absolute" className="p-4 space-y-4">
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold mb-1 block" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    FROM
                                </label>
                                <input
                                    type="datetime-local"
                                    value={customFrom}
                                    onChange={(e) => setCustomFrom(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ 
                                        background: "rgb(var(--theme-surface))", 
                                        borderColor: "rgb(var(--theme-border))", 
                                        color: "rgb(var(--theme-text))",
                                        border: "1px solid"
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold mb-1 block" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    TO
                                </label>
                                <input
                                    type="datetime-local"
                                    value={customTo}
                                    onChange={(e) => setCustomTo(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ 
                                        background: "rgb(var(--theme-surface))", 
                                        borderColor: "rgb(var(--theme-border))", 
                                        color: "rgb(var(--theme-text))",
                                        border: "1px solid"
                                    }}
                                />
                            </div>
                            <Button
                                onClick={handleCustomRange}
                                disabled={!customFrom || !customTo}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Apply time range
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}
