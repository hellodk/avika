import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const sessionCookie = request.cookies.get("avika_session")?.value;

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/waf/policies/${id}`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
            cache: "no-store",
        });

        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("WAF policy API error:", error);
        return NextResponse.json({ error: "Failed to fetch WAF policy" }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const body = await request.json();

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/waf/policies/${id}`, {
            method: "PUT",
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
        console.error("WAF policy API error:", error);
        return NextResponse.json({ error: "Failed to update WAF policy" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const sessionCookie = request.cookies.get("avika_session")?.value;

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/waf/policies/${id}`, {
            method: "DELETE",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
            cache: "no-store",
        });

        if (gatewayResponse.status === 204 || gatewayResponse.ok) {
            return new NextResponse(null, { status: gatewayResponse.status });
        }
        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("WAF policy API error:", error);
        return NextResponse.json({ error: "Failed to delete WAF policy" }, { status: 500 });
    }
}
