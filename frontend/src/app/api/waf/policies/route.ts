import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/waf/policies`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
            cache: "no-store",
        });

        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("WAF policies API error:", error);
        return NextResponse.json({ error: "Failed to fetch WAF policies" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const body = await request.json();

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/waf/policies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
            },
            body: JSON.stringify(body),
            cache: "no-store",
        });

        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("WAF policies API error:", error);
        return NextResponse.json({ error: "Failed to create WAF policy" }, { status: 500 });
    }
}
