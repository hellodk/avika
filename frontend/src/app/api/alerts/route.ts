
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getAgentServiceClient();
    console.log('GET /api/alerts - listing rules');

    return new Promise<NextResponse>((resolve) => {
        client.ListAlertRules({}, (err: any, response: any) => {
            if (err) {
                console.error('gRPC ListAlertRules Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to fetch alert rules' }, { status: 500 })
                );
            }
            resolve(NextResponse.json(response.rules || []));
        });
    });
}

export async function POST(request: Request) {
    const rule = await request.json();
    const client = getAgentServiceClient();
    console.log('POST /api/alerts - creating/updating rule');

    return new Promise<NextResponse>((resolve) => {
        client.CreateAlertRule(rule, (err: any, response: any) => {
            if (err) {
                console.error('gRPC CreateAlertRule Error:', err);
                return resolve(
                    NextResponse.json({ error: err.message }, { status: 500 })
                );
            }
            resolve(NextResponse.json(response));
        });
    });
}
