import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

export const dynamic = 'force-dynamic';

const GATEWAY_URL = getGatewayUrl();

export async function GET() {
    try {
        const response = await fetch(`${GATEWAY_URL}/updates/version.json`, {
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            console.error('Failed to fetch version from gateway:', response.status);
            return NextResponse.json(
                { version: "0.0.0", error: 'Failed to fetch latest version' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json({
            version: data.version || "0.0.0",
            build_date: data.build_date,
            git_commit: data.git_commit,
        });
    } catch (error: any) {
        console.error('Error fetching agent version:', error);
        return NextResponse.json(
            { version: "0.0.0", error: error.message },
            { status: 500 }
        );
    }
}
