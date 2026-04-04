import { NextRequest, NextResponse } from "next/server";

import { getGatewayUrl } from '@/lib/gateway-url';
import { gatewayProxyCookieHeaders } from "@/lib/gateway-proxy-headers";

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/projects`, {
      headers: {
        ...gatewayProxyCookieHeaders(request),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${GATEWAY_URL}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...gatewayProxyCookieHeaders(request),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to create project" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
