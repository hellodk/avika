import { NextRequest, NextResponse } from "next/server";

import { getGatewayUrl } from "@/lib/gateway-url";
import { gatewayProxyCookieHeaders } from "@/lib/gateway-proxy-headers";

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/slo-targets`, {
      headers: {
        ...gatewayProxyCookieHeaders(request),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch SLO targets" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SLO targets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${GATEWAY_URL}/api/slo-targets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...gatewayProxyCookieHeaders(request),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => "");
      return NextResponse.json(
        { error: errorData || "Failed to create SLO target" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error creating SLO target:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const url = new URL("/api/slo-targets", GATEWAY_URL);
    url.searchParams.set("id", id);

    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: {
        ...gatewayProxyCookieHeaders(request),
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: errText || "Failed to delete SLO target" },
        { status: response.status }
      );
    }

    return new NextResponse(null, { status: response.status });
  } catch (error) {
    console.error("Error deleting SLO target:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
