
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const start = parseInt(searchParams.get('start') || '0');
    const end = parseInt(searchParams.get('end') || '0');
    const agentIds = searchParams.get('agent_ids')?.split(',') || [];
    const type = searchParams.get('type') || 'summary';

    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.GenerateReport({
            start_time: start,
            end_time: end,
            agent_ids: agentIds,
            report_type: type,
        }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GenerateReport Error:', err);
                return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
            }
            resolve(NextResponse.json(response));
        });
    });
}
