import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const res = await fetch(`${GATEWAY_URL}/api/projects/${id}/groups`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error("Failed to fetch project groups", error);
        return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
    }
}
