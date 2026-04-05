import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.GATEWAY_URL || "http://localhost:5021";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("avika_session");
  const params = request.nextUrl.searchParams.toString();

  try {
    const response = await fetch(`${GATEWAY_URL}/api/analytics/visitor-drilldown${params ? `?${params}` : ""}`, {
      headers: { Cookie: sessionCookie ? `avika_session=${sessionCookie.value}` : "" },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Visitor drilldown proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch visitor drilldown" }, { status: 502 });
  }
}
