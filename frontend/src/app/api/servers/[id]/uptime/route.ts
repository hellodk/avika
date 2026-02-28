import { NextRequest, NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await params;
    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.getUptimeReports({ agent_id: id, limit: 20 }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC Error:', err);
                resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                return;
            }
            resolve(NextResponse.json(response.reports || []));
        });
    });
}
