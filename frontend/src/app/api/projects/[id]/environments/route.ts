import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:5050";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("avika_session");

    const response = await fetch(
      `${GATEWAY_URL}/api/projects/${id}/environments`,
      {
        headers: {
          Cookie: sessionCookie ? `avika_session=${sessionCookie.value}` : "",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch environments" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching environments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("avika_session");
    const body = await request.json();

    const response = await fetch(
      `${GATEWAY_URL}/api/projects/${id}/environments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie ? `avika_session=${sessionCookie.value}` : "",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to create environment" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating environment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
