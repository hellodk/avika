import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";
import { normalizeServerId } from "@/lib/api";

const GATEWAY_URL = getGatewayUrl();

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    try {
        const body = await request.json();
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${encodeURIComponent(id)}/config/restore`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
            },
            body: JSON.stringify({ backup_name: body.backup_name }),
        });
        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("Failed to restore agent config", error);
        return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
    }
}
