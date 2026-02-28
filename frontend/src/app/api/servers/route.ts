import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import * as grpc from '@grpc/grpc-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.ListAgents({}, (err: any, response: any) => {
            if (err) {
                console.error('gRPC Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
                );
            }
            resolve(NextResponse.json({
                agents: response.agents || [],
                system_version: response.system_version || "0.1.0"
            }));
        });
    });
}
