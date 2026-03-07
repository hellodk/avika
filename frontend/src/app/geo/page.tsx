"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy /geo route: redirect to Geo Analytics.
 * next.config also redirects /geo -> /analytics/geo for server requests.
 */
export default function GeoPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/analytics/geo");
    }, [router]);
    return null;
}
