import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";
import { getAgentServiceClient } from "@/lib/grpc-client";

export const dynamic = "force-dynamic";

const GATEWAY_URL = getGatewayUrl();

/** Normalize gateway ListAgents payload (gRPC JSON or HTTP) for the inventory UI. */
function normalizeAgentsPayload(data: {
    agents?: unknown[];
    system_version?: string;
    systemVersion?: string;
}) {
    const rawAgents = Array.isArray(data?.agents) ? data.agents : [];
    const normalizedAgents = rawAgents.map((agent: unknown) => {
        const a = agent as Record<string, unknown>;
        return {
        ...a,
        agent_id: a.agentId ?? a.agent_id ?? a.id,
        agent_version: a.agentVersion ?? a.agent_version,
        instances_count: a.instancesCount ?? a.instances_count,
        last_seen: a.lastSeen ?? a.last_seen,
        is_pod: a.isPod ?? a.is_pod ?? a.is_test,
        pod_ip: a.podIp ?? a.pod_ip,
        psk_authenticated: a.pskAuthenticated ?? a.psk_authenticated,
        build_date: a.buildDate ?? a.build_date,
        git_commit: a.gitCommit ?? a.git_commit,
        git_branch: a.gitBranch ?? a.git_branch,
        version: a.version,
        ip: a.ip,
        hostname: a.hostname,
        status: a.status,
        uptime: a.uptime,
    };
    });
    return {
        agents: normalizedAgents,
        system_version: data.systemVersion ?? data.system_version ?? "0.1.0",
    };
}

async function listAgentsViaHttp(request: NextRequest): Promise<NextResponse> {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const cookieHeader =
        sessionCookie != null
            ? `avika_session=${sessionCookie}`
            : request.headers.get("cookie") ?? undefined;

    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/servers`, {
        method: "GET",
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
    });

    const text = await gatewayResponse.text();
    let data: Record<string, unknown>;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON from gateway", agents: [], system_version: "0.0.0" },
            { status: 502 }
        );
    }

    if (!gatewayResponse.ok) {
        return NextResponse.json(
            {
                error: (data as { error?: string }).error || "Failed to fetch agents",
                agents: [],
                system_version: "0.0.0",
            },
            { status: gatewayResponse.status }
        );
    }

    const body = normalizeAgentsPayload(data as Parameters<typeof normalizeAgentsPayload>[0]);
    return NextResponse.json(body);
}

async function listAgentsViaGrpc(): Promise<NextResponse> {
    let client;
    try {
        client = getAgentServiceClient();
    } catch (e) {
        console.error("Failed to get gRPC client:", e);
        return NextResponse.json({ agents: [], system_version: "0.0.0" });
    }

    return new Promise<NextResponse>((resolve) => {
        client.ListAgents({}, (err: unknown, response: Record<string, unknown>) => {
            if (err) {
                console.error("gRPC ListAgents error:", err);
                return resolve(NextResponse.json({ agents: [], system_version: "0.0.0" }));
            }
            resolve(NextResponse.json(normalizeAgentsPayload(response)));
        });
    });
}

export async function GET(request: NextRequest) {
    if (process.env.NEXT_PUBLIC_MOCK_BACKEND === "true") {
        const now = Math.floor(Date.now() / 1000);
        return NextResponse.json({
            agents: [
                {
                    id: "mock-grpc-node-1",
                    agent_id: "mock-grpc-node-1",
                    hostname: "ingress.mock",
                    active: true,
                    ip: "192.168.1.10",
                    version: "1.24.0",
                    agent_version: "0.1.0",
                    last_seen: now - 60,
                },
                {
                    id: "mock-grpc-node-2",
                    agent_id: "mock-grpc-node-2",
                    hostname: "app-server.mock",
                    active: false,
                    ip: "192.168.1.11",
                    version: "1.24.0",
                    agent_version: "0.1.0",
                    last_seen: now - 3600,
                },
            ],
            system_version: "mock-1.0.0",
        });
    }

    if (process.env.SERVERS_LIST_USE_GRPC === "true") {
        return listAgentsViaGrpc();
    }

    try {
        return await listAgentsViaHttp(request);
    } catch (error) {
        console.error("HTTP proxy to gateway /api/servers failed:", error);
        return NextResponse.json(
            { error: "Failed to connect to gateway", agents: [], system_version: "0.0.0" },
            { status: 502 }
        );
    }
}
