import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const traceId = params.id;
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id') || 'all';

    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.GetTraceDetails({
            agent_id: agentId,
            trace_id: traceId
        }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetTraceDetails Error:', err);
                return resolve(NextResponse.json({ error: 'Failed to fetch trace details' }, { status: 500 }));
            }
            resolve(NextResponse.json(response || {}));
        });
    });
}
