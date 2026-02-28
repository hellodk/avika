"use client";

import { Card } from "@/components/ui/card";
import { format } from "date-fns";

interface Span {
    trace_id: string;
    span_id: string;
    parent_span_id: string;
    name: string;
    start_time: string; // nano string
    end_time: string; // nano string
    attributes: Record<string, string>;
}

interface Trace {
    request_id: string;
    spans: Span[];
}

export function TraceWaterfall({ trace }: { trace: Trace }) {
    if (!trace || !trace.spans || trace.spans.length === 0) return <div className="p-4 text-muted-foreground">No spans found in trace.</div>;

    // Find range
    let minStart = Number.MAX_SAFE_INTEGER;
    let maxEnd = 0;

    trace.spans.forEach(s => {
        const start = parseInt(s.start_time) / 1000000; // ms
        const end = parseInt(s.end_time) / 1000000; // ms
        if (start < minStart) minStart = start;
        if (end > maxEnd) maxEnd = end;
    });

    const totalDuration = maxEnd - minStart;

    // Sort by start time.
    const sortedSpans = [...trace.spans].sort((a, b) => parseInt(a.start_time) - parseInt(b.start_time));

    return (
        <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground pb-2 border-b">
                <span>Timeline ({totalDuration.toFixed(2)}ms)</span>
                <span>Start: {format(new Date(minStart), "HH:mm:ss.SSS")}</span>
            </div>
            <div className="space-y-1">
                {sortedSpans.map(span => {
                    const start = parseInt(span.start_time) / 1000000;
                    const end = parseInt(span.end_time) / 1000000;
                    const duration = end - start;
                    const offset = start - minStart;

                    const leftPercent = (offset / totalDuration) * 100;
                    const widthPercent = Math.max((duration / totalDuration) * 100, 0.5); // Min 0.5% width visibility

                    const isRoot = !span.parent_span_id;

                    return (
                        <div key={span.span_id} className="group relative flex items-center h-8 hover:bg-muted/50 rounded px-2 text-sm transition-colors">
                            <div className="w-1/4 min-w-[150px] truncate font-medium pr-4 flex items-center gap-2" title={span.name}>
                                <span className={`w-2 h-2 rounded-full ${isRoot ? "bg-blue-500" : "bg-green-500"}`}></span>
                                {span.name}
                            </div>
                            <div className="flex-1 relative h-full flex items-center">
                                <div className="absolute w-full h-px bg-border top-1/2 -z-10" />
                                <div
                                    className={`absolute h-4 rounded-sm ${isRoot ? "bg-blue-500" : "bg-green-500"} opacity-70 group-hover:opacity-100 transition-all cursor-pointer shadow-sm`}
                                    style={{
                                        left: `${leftPercent}%`,
                                        width: `${widthPercent}%`
                                    }}
                                    title={`Start: ${(start - minStart).toFixed(2)}ms | Duration: ${duration.toFixed(2)}ms`}
                                />
                                <span className="absolute text-xs text-muted-foreground ml-2 whitespace-nowrap" style={{ left: `calc(${leftPercent + widthPercent}% + 8px)` }}>
                                    {duration.toFixed(2)} ms
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Attributes Table for Root Span or Selected */}
            {trace.spans.length > 0 && (
                <div className="mt-8 pt-4 border-t">
                    <h3 className="text-sm font-semibold mb-3">Trace Attributes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trace.spans.map((span) => (
                            <Card key={span.span_id} className="p-4 text-xs">
                                <div className="font-semibold mb-2 border-b pb-1">{span.name}</div>
                                <div className="space-y-1">
                                    {Object.entries(span.attributes || {}).map(([k, v]) => (
                                        <div key={k} className="flex flex-col">
                                            <span className="text-muted-foreground font-mono">{k}</span>
                                            <span className="font-mono break-all">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
