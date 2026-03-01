import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "http://avika-gateway:5021";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const window = searchParams.get('window') || '24h';
        const environmentId = searchParams.get('environment_id');
        const projectId = searchParams.get('project_id');

        // Build query string with optional filters
        let queryString = `window=${window}`;
        if (environmentId) {
            queryString += `&environment_id=${environmentId}`;
        } else if (projectId) {
            queryString += `&project_id=${projectId}`;
        }

        // Get session cookie to forward
        const sessionCookie = request.cookies.get("avika_session");

        // Forward geo request to gateway
        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/geo?${queryString}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie.value}` } : {}),
            },
            cache: 'no-store',
        });

        if (!gatewayResponse.ok) {
            console.error(`Gateway geo request failed with status: ${gatewayResponse.status}`);
            return NextResponse.json(
                {
                    locations: [],
                    country_stats: [],
                    city_stats: [],
                    recent_requests: [],
                    total_countries: 0,
                    total_cities: 0,
                    total_requests: 0,
                    top_country_code: "",
                },
                { status: 200 }
            );
        }

        const data = await gatewayResponse.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Geo API error:", error);
        return NextResponse.json(
            {
                locations: [],
                country_stats: [],
                city_stats: [],
                recent_requests: [],
                total_countries: 0,
                total_cities: 0,
                total_requests: 0,
                top_country_code: "",
            },
            { status: 200 }
        );
    }
}
