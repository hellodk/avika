import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import * as grpc from '@grpc/grpc-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (process.env.NEXT_PUBLIC_MOCK_BACKEND === "true") {
        return NextResponse.json({
            agents: [
                { id: "mock-grpc-node-1", agent_id: "mock-grpc-node-1", hostname: "ingress.mock", active: true },
                { id: "mock-grpc-node-2", agent_id: "mock-grpc-node-2", hostname: "app-server.mock", active: false }
            ],
            system_version: "mock-1.0.0"
        });
    }

    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.ListAgents({}, (err: any, response: any) => {
            if (err) {
                console.error('gRPC Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
                );
            }
            
            // Debug: Log raw response to see field names and data
            console.log('gRPC ListAgents raw response:', JSON.stringify(response, null, 2));

            const normalizedAgents = (response.agents || []).map((agent: any) => {
                // Debug: Log one agent to see internal structure
                if (response.agents.indexOf(agent) === 0) {
                    console.log('Sample agent structure:', JSON.stringify(agent, null, 2));
                }
                
                return {
                    ...agent,
                    agent_id: agent.agentId || agent.agent_id || agent.id,
                    agent_version: agent.agentVersion || agent.agent_version,
                    instances_count: agent.instancesCount || agent.instances_count,
                    last_seen: agent.lastSeen || agent.last_seen,
                    is_pod: agent.isPod || agent.is_pod || agent.is_test,
                    pod_ip: agent.podIp || agent.pod_ip,
                    psk_authenticated: agent.pskAuthenticated || agent.psk_authenticated,
                    build_date: agent.buildDate || agent.build_date,
                    git_commit: agent.gitCommit || agent.git_commit,
                    git_branch: agent.gitBranch || agent.git_branch,
                    // Ensure these are explicitly mapped if missing from ...agent
                    version: agent.version,
                    ip: agent.ip,
                    hostname: agent.hostname,
                    status: agent.status,
                    uptime: agent.uptime,
                };
            });
            resolve(NextResponse.json({
                agents: normalizedAgents,
                system_version: response.systemVersion || response.system_version || "0.1.0"
            }));
        });
    });
}
