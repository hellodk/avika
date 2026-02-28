"use client";

import React from 'react';

interface GaugeProps {
    value: number;
    min?: number;
    max?: number;
    label: string;
    unit?: string;
    color?: string;
    /** Optional: show warning/critical thresholds */
    warningThreshold?: number;
    criticalThreshold?: number;
}

export function Gauge({
    value,
    min = 0,
    max = 100,
    label,
    unit = "%",
    color = "#6366f1",
    warningThreshold = 70,
    criticalThreshold = 90
}: GaugeProps) {
    const clampedValue = Math.min(Math.max(value, min), max);
    const percentage = ((clampedValue - min) / (max - min)) * 100;

    // SVG Path for a semi-circle
    // Radius 40, Center (50, 50)
    const radius = 40;
    const circumference = Math.PI * radius; // Half circle
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    // Dynamic color based on thresholds (accessibility improvement)
    const getGaugeColor = () => {
        if (clampedValue >= criticalThreshold) return "#ef4444"; // red-500
        if (clampedValue >= warningThreshold) return "#f59e0b"; // amber-500
        return color;
    };

    // Status text for screen readers
    const getStatusText = () => {
        if (clampedValue >= criticalThreshold) return "critical";
        if (clampedValue >= warningThreshold) return "warning";
        return "normal";
    };

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className="relative w-32 h-20">
                <svg 
                    viewBox="0 0 100 60" 
                    className="w-full h-full"
                    role="img"
                    aria-label={`${label}: ${clampedValue.toFixed(1)}${unit}, status ${getStatusText()}`}
                >
                    {/* Background Arc - theme aware */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="rgb(var(--theme-border))"
                        strokeWidth="10"
                        strokeLinecap="round"
                        opacity="0.4"
                    />
                    {/* Foreground Arc */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={getGaugeColor()}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        style={{
                            strokeDashoffset,
                            transition: 'stroke-dashoffset 0.5s ease-out'
                        }}
                    />
                    {/* Value text - FIXED: theme-aware color */}
                    <text
                        x="50"
                        y="45"
                        textAnchor="middle"
                        className="text-[14px] font-bold"
                        style={{ fill: "rgb(var(--theme-text))" }}
                    >
                        {clampedValue.toFixed(1)}{unit}
                    </text>
                </svg>
            </div>
            {/* Label - FIXED: theme-aware color */}
            <span 
                className="text-xs font-medium mt-[-5px]"
                style={{ color: "rgb(var(--theme-text-muted))" }}
            >
                {label}
            </span>
        </div>
    );
}
