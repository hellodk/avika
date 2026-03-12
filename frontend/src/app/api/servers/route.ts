import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import * as grpc from '@grpc/grpc-js';

export const dynamic = 'force-dynamic';

export async function GET() {
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
            system_version: "mock-1.0.0"
        });
    }

    let client;
    try {
        client = getAgentServiceClient();
    } catch (e) {
        console.error('Failed to get gRPC client (e.g. proto not found or gateway unreachable):', e);
        return NextResponse.json({ agents: [], system_version: "0.0.0" });
    }

    return new Promise<NextResponse>((resolve) => {
        client.ListAgents({}, (err: any, response: any) => {
            if (err) {
                console.error('gRPC ListAgents error:', err);
                return resolve(NextResponse.json({ agents: [], system_version: "0.0.0" }));
            }

            const rawAgents = response?.agents ?? [];
            const normalizedAgents = (Array.isArray(rawAgents) ? rawAgents : []).map((agent: any) => ({
                ...agent,
                agent_id: agent.agentId || agent.agent_id || agent.id,
                agent_version: agent.agentVersion || agent.agent_version,
                instances_count: agent.instancesCount || agent.instances_count,
                last_seen: agent.lastSeen ?? agent.last_seen,
                is_pod: agent.isPod || agent.is_pod || agent.is_test,
                pod_ip: agent.podIp || agent.pod_ip,
                psk_authenticated: agent.pskAuthenticated || agent.psk_authenticated,
                build_date: agent.buildDate || agent.build_date,
                git_commit: agent.gitCommit || agent.git_commit,
                git_branch: agent.gitBranch || agent.git_branch,
                version: agent.version,
                ip: agent.ip,
                hostname: agent.hostname,
                status: agent.status,
                uptime: agent.uptime,
            }));
            resolve(NextResponse.json({
                agents: normalizedAgents,
                system_version: response?.systemVersion ?? response?.system_version ?? "0.1.0"
            }));
        });
    });
}
