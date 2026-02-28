"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { TraceWaterfall } from "@/components/analytics/TraceWaterfall";

// Define locally or import types
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

export default function TraceDetailsPage() {
    const params = useParams();
    const traceId = params.id as string;
    const [trace, setTrace] = useState<Trace | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (traceId) {
            fetchTrace();
        }
    }, [traceId]);

    const fetchTrace = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/traces/${traceId}`);
            if (!res.ok) throw new Error("Failed");
            const data = await res.json();
            setTrace(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center space-x-4">
                <Link href="/analytics/traces">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h2 className="text-3xl font-bold tracking-tight">Trace Details</h2>
            </div>
            <div className="text-muted-foreground font-mono text-sm ml-12 mb-4">
                ID: {traceId}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Request Waterfall</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-10 text-center">Loading trace details...</div>
                    ) : trace ? (
                        <TraceWaterfall trace={trace} />
                    ) : (
                        <div className="py-10 text-center text-muted-foreground">Trace not found</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
