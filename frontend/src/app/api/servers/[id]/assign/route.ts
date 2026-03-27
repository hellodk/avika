import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getGatewayUrl } from "@/lib/gateway-url";
import { normalizeServerId } from "@/lib/api";

const GATEWAY_URL = getGatewayUrl();

// POST /api/servers/[id]/assign - Assign an agent/server to an environment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = normalizeServerId(rawId);

  if (!id) {
    return NextResponse.json({ error: "agent ID required" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { environment_id, display_name, tags } = body ?? {};

    if (!environment_id) {
      return NextResponse.json(
        { error: "environment_id is required" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("avika_session")?.value;

    const gatewayResponse = await fetch(
      `${GATEWAY_URL}/api/servers/${encodeURIComponent(id)}/assign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
        },
        body: JSON.stringify({
          environment_id,
          display_name: display_name ?? "",
          tags: Array.isArray(tags) ? tags : [],
        }),
      }
    );

    const data = await gatewayResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to assign server", error);
    return NextResponse.json(
      { error: "Failed to assign server" },
      { status: 500 }
    );
  }
}

