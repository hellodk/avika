"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "./api";

// Build-time fallback baked in by Docker --build-arg VERSION=x.y.z
const BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * Returns the live gateway version, falling back to the build-time value.
 *
 * The build-time NEXT_PUBLIC_APP_VERSION can be stale if the frontend image
 * is older than the running gateway. Fetching from /api/system/version at
 * runtime guarantees the displayed version always matches what is deployed.
 */
export function useAppVersion(): string {
    const [version, setVersion] = useState<string>(BUILD_VERSION);

    useEffect(() => {
        apiFetch("/api/system/version")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { version?: string } | null) => {
                if (data?.version) setVersion(data.version);
            })
            .catch(() => {
                // Network error — keep build-time fallback silently
            });
    }, []);

    return version;
}
