import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('timeWindow') || '24h';
    const agentId = searchParams.get('agent_id');

    const client = getAgentServiceClient();

    const visitorRequest: any = {
        time_window: timeWindow,
    };

    if (agentId && agentId !== 'all') {
        visitorRequest.agent_id = agentId;
    }

    return new Promise<NextResponse>((resolve) => {
        client.GetVisitorAnalytics(visitorRequest, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetVisitorAnalytics Error:', err);
                return resolve(
                    NextResponse.json({
                        summary: {
                            unique_visitors: 0,
                            total_hits: 0,
                            total_bandwidth: 0,
                            bot_hits: 0,
                            human_hits: 0,
                        },
                        browsers: [],
                        operating_systems: [],
                        referrers: [],
                        not_found: [],
                        hourly: [],
                        devices: { desktop: 0, mobile: 0, tablet: 0, other: 0 },
                        static_files: [],
                    })
                );
            }
            resolve(NextResponse.json(response || {}));
        });
    });
}
