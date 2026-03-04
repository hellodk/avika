import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export const dynamic = 'force-dynamic';

const emptyResponse = {
    summary: {
        unique_visitors: "0",
        total_hits: "0",
        total_bandwidth: "0",
        bot_hits: "0",
        human_hits: "0",
    },
    browsers: [],
    operating_systems: [],
    referrers: [],
    not_found: [],
    hourly: [],
    devices: { desktop: "0", mobile: "0", tablet: "0", other: "0" },
    static_files: [],
};

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const timeWindow = searchParams.get('timeWindow') || '24h';
        const agentId = searchParams.get('agent_id');

        let queryString = `timeWindow=${timeWindow}`;
        if (agentId && agentId !== 'all') {
            queryString += `&agent_id=${encodeURIComponent(agentId)}`;
        }

        const sessionCookie = request.cookies.get("avika_session");
        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/visitor-analytics?${queryString}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie.value}` } : {}),
            },
            cache: 'no-store',
        });

        if (!gatewayResponse.ok) {
            console.error(`Gateway visitor-analytics failed: ${gatewayResponse.status}`);
            return NextResponse.json(emptyResponse);
        }

        const data = await gatewayResponse.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Visitor analytics API error:", error);
        return NextResponse.json(emptyResponse);
    }
}
