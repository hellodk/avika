import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: agentId } = await params;
    console.log(`[Update API] Triggering update for agent: "${agentId}"`);
    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.UpdateAgent({ agent_id: agentId }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC Error:', err);
                return resolve(
                    NextResponse.json({ error: err.details || 'Failed to update agent' }, { status: 500 })
                );
            }

            if (!response.success) {
                return resolve(
                    NextResponse.json({ error: response.message || 'Update failed' }, { status: 400 })
                );
            }

            resolve(NextResponse.json({ success: true, message: response.message }));
        });
    });
}
