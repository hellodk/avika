import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const groupA = searchParams.get("groupA");
    const groupB = searchParams.get("groupB");
    if (!groupA || !groupB) {
        return NextResponse.json(
            { error: "groupA and groupB query params required" },
            { status: 400 }
        );
    }
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const url = `${GATEWAY_URL}/api/projects/${projectId}/drift/compare?groupA=${encodeURIComponent(groupA)}&groupB=${encodeURIComponent(groupB)}`;
        const res = await fetch(url, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error("Failed to compare drift", error);
        return NextResponse.json({ error: "Failed to compare drift" }, { status: 500 });
    }
}
