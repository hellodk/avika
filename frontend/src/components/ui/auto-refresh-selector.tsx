"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AutoRefreshConfig {
    enabled: boolean;
    interval: number; // in milliseconds
    label: string;
}

interface AutoRefreshSelectorProps {
    value: AutoRefreshConfig;
    onChange: (config: AutoRefreshConfig) => void;
}

const REFRESH_INTERVALS = [
    { value: 0, label: "Off" },
    { value: 5000, label: "5s" },
    { value: 10000, label: "10s" },
    { value: 30000, label: "30s" },
    { value: 60000, label: "1m" },
    { value: 300000, label: "5m" },
    { value: 900000, label: "15m" },
    { value: 1800000, label: "30m" },
    { value: 3600000, label: "1h" },
    { value: 7200000, label: "2h" },
];

export function AutoRefreshSelector({ value, onChange }: AutoRefreshSelectorProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleSelect = (interval: number, label: string) => {
        onChange({
            enabled: interval > 0,
            interval,
            label,
        });
    };

    // Visual pulse effect when refreshing
    useEffect(() => {
        if (value.enabled) {
            setIsRefreshing(true);
            const timer = setTimeout(() => setIsRefreshing(false), 500);
            return () => clearTimeout(timer);
        }
    }, [value.enabled]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={`bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium text-sm ${value.enabled ? 'border-blue-300 bg-blue-50' : ''
                        }`}
                >
                    <RefreshCw
                        className={`h-4 w-4 mr-2 ${isRefreshing && value.enabled ? 'animate-spin text-blue-600' : 'text-slate-500'
                            }`}
                    />
                    {value.enabled ? `Auto-refresh: ${value.label}` : 'Auto-refresh: Off'}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                {REFRESH_INTERVALS.map((interval) => (
                    <DropdownMenuItem
                        key={interval.value}
                        onClick={() => handleSelect(interval.value, interval.label)}
                        className={`cursor-pointer ${value.interval === interval.value
                            ? 'bg-blue-600 text-white font-semibold focus:bg-blue-700 focus:text-white'
                            : 'hover:bg-slate-100'
                            }`}
                    >
                        {interval.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
