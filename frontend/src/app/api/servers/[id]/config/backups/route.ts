import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";
import { normalizeServerId } from "@/lib/api";

const GATEWAY_URL = getGatewayUrl();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${encodeURIComponent(id)}/config/backups`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
        });
        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("Failed to fetch agent config backups", error);
        return NextResponse.json({ error: "Failed to fetch backups" }, { status: 500 });
    }
}
