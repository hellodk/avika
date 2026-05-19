import { NextRequest, NextResponse } from "next/server";

import { getGatewayUrl } from "@/lib/gateway-url";
import { gatewayProxyCookieHeaders } from "@/lib/gateway-proxy-headers";

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/slo-compliance`, {
      headers: {
        ...gatewayProxyCookieHeaders(request),
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: errText || "Failed to fetch SLO compliance" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SLO compliance:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
