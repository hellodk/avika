import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "http://avika-gateway:5021";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get session cookie to forward
    const sessionCookie = request.cookies.get("avika_session");

    // Forward change-password request to gateway
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie.value}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await gatewayResponse.json();

    // Create response with same data
    const response = NextResponse.json(data, { status: gatewayResponse.status });

    // Forward any updated cookies from gateway
    const setCookie = gatewayResponse.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to connect to authentication service" },
      { status: 500 }
    );
  }
}
