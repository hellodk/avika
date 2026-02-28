import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.GATEWAY_URL || "http://localhost:5050";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("avika_session");

    const response = await fetch(`${GATEWAY_URL}/api/projects`, {
      headers: {
        Cookie: sessionCookie ? `avika_session=${sessionCookie.value}` : "",
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
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("avika_session");
    const body = await request.json();

    const response = await fetch(`${GATEWAY_URL}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie ? `avika_session=${sessionCookie.value}` : "",
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
