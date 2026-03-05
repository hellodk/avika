import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

/** Strip Domain= from cookie so the browser binds it to the response host (our app), not the gateway. */
function stripCookieDomain(cookie: string): string {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^Domain=/i.test(part))
    .join("; ");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward login request to gateway
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await gatewayResponse.json();

    // Create response with same data
    const response = NextResponse.json(data, { status: gatewayResponse.status });

    // Forward all Set-Cookie headers so the browser stores the session for this origin.
    // Strip Domain so the cookie is bound to our host (fixes first-login-fails when gateway sets Domain).
    const setCookies =
      typeof gatewayResponse.headers.getSetCookie === "function"
        ? gatewayResponse.headers.getSetCookie()
        : gatewayResponse.headers.get("set-cookie")
          ? [gatewayResponse.headers.get("set-cookie")!]
          : [];
    for (const cookie of setCookies) {
      response.headers.append("set-cookie", stripCookieDomain(cookie));
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to connect to authentication service" },
      { status: 500 }
    );
  }
}
