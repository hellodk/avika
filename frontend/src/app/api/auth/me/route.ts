import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "http://avika-gateway:5021";

export async function GET(request: NextRequest) {
  try {
    // Get session cookie
    const sessionCookie = request.cookies.get("avika_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    // Forward request to gateway
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        Cookie: `avika_session=${sessionCookie}`,
      },
    });

    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
