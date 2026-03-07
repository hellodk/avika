"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ServerDetailError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="text-lg font-semibold" style={{ color: `rgb(var(--theme-text))` }}>
                Something went wrong
            </h2>
            <p className="text-sm text-neutral-400 text-center max-w-md">
                This server page could not be loaded. This can happen with certain server IDs (for example containing special characters). Check the browser console for details.
            </p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={reset}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try again
                </Button>
                <Button variant="secondary" asChild>
                    <Link href="/inventory">Back to Inventory</Link>
                </Button>
            </div>
        </div>
    );
}
