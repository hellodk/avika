"use client";

import { GeoDashboard } from "@/components/analytics/GeoDashboard";

export default function GeoAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--theme-text))" }}>
          Geo Analytics
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
          Request distribution by country and city
        </p>
      </div>
      <GeoDashboard />
    </div>
  );
}
