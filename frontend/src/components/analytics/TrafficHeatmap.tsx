"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HeatmapData {
    time: string;
    [key: string]: any;
}

interface TrafficHeatmapProps {
    data: HeatmapData[];
    keys: string[];
    title: string;
}

const COLORS: Record<string, string> = {
    "2xx": "bg-emerald-500",
    "3xx": "bg-blue-500",
    "4xx": "bg-amber-500",
    "5xx": "bg-rose-500",
    "default": "bg-slate-400"
};

export function TrafficHeatmap({ data, keys, title }: TrafficHeatmapProps) {
    // We want a grid where X is time and Y is status group
    // For simplicity, we'll render a colored grid

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-2">
                    {keys.map(key => (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-[10px] font-medium w-6 text-slate-500 uppercase">{key}</span>
                            <div className="flex-1 flex gap-0.5 h-6">
                                {data.map((point, i) => {
                                    const val = point[key] || 0;
                                    // Calculate opacity based on value
                                    // Normalized for the last 30 points
                                    const maxInKey = Math.max(...data.map(d => d[key] || 0), 1);
                                    const opacity = (val / maxInKey) * 0.9 + 0.1;

                                    return (
                                        <div
                                            key={i}
                                            className={`flex-1 rounded-[1px] ${COLORS[key] || COLORS.default}`}
                                            style={{ opacity }}
                                            title={`${point.time} - ${key}: ${val}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    <div className="flex justify-between items-center mt-1 px-8 text-[9px] text-slate-400">
                        <span>Earlier</span>
                        <span>Time →</span>
                        <span>Now</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
