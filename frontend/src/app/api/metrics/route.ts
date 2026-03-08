import { NextResponse } from "next/server";
import { toPrometheusText } from "@/lib/metrics";

/**
 * Prometheus scrape endpoint. Unauthenticated; returns avika_frontend_* metrics.
 * Path when using basePath: BASE_PATH/api/metrics (e.g. /avika/api/metrics).
 */
export async function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";
  const body = toPrometheusText(version);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
