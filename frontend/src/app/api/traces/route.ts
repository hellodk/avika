import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('window') || '1h';
    const limit = parseInt(searchParams.get('limit') || '50');
    const agentId = searchParams.get('agent_id') || 'all';

    const client = getAgentServiceClient();

    // Prepare request object
    const req: any = {
        agent_id: agentId,
        time_window: timeWindow,
        limit: limit,
        status_filter: searchParams.get('status') || '',
        method_filter: searchParams.get('method') || '',
        uri_filter: searchParams.get('uri') || ''
    };

    return new Promise<NextResponse>((resolve) => {
        client.GetTraces(req, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetTraces Error:', err);
                return resolve(NextResponse.json({ traces: [] }));
            }
            resolve(NextResponse.json(response || { traces: [] }));
        });
    });
}
