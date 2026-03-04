import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function POST(request: NextRequest) {
  try {
    // Get session cookie
    const sessionCookie = request.cookies.get("avika_session")?.value;

    // Forward logout request to gateway
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        ...(sessionCookie && { Cookie: `avika_session=${sessionCookie}` }),
      },
    });

    const data = await gatewayResponse.json();

    // Create response and clear cookie
    const response = NextResponse.json(data, { status: gatewayResponse.status });

    // Clear the session cookie
    response.cookies.set("avika_session", "", {
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to logout" },
      { status: 500 }
    );
  }
}
