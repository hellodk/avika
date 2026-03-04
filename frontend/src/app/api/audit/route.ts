import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get("limit") || "100";
        const queryString = new URLSearchParams({ limit }).toString();
        const sessionCookie = request.cookies.get("avika_session")?.value;

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/audit?${queryString}`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
            cache: "no-store",
        });

        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("Audit API error:", error);
        return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
    }
}
