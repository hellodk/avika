
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('window') || '24h';
    const fromTimestamp = searchParams.get('from');
    const toTimestamp = searchParams.get('to');
    const timezone = searchParams.get('timezone') || 'UTC';

    const client = getAgentServiceClient();

    const agentId = searchParams.get('agent_id');
    const environmentId = searchParams.get('environment_id');
    const projectId = searchParams.get('project_id');
    
    const analyticsRequest: any = {
        timezone: timezone,
    };

    // Project/environment filtering takes precedence over single agent_id
    if (environmentId) {
        analyticsRequest.environment_id = environmentId;
    } else if (projectId) {
        analyticsRequest.project_id = projectId;
    } else if (agentId && agentId !== 'all') {
        analyticsRequest.agent_id = agentId;
    }

    if (fromTimestamp && toTimestamp) {
        // Absolute time range (milliseconds)
        analyticsRequest.from_timestamp = parseInt(fromTimestamp);
        analyticsRequest.to_timestamp = parseInt(toTimestamp);
    } else {
        // Relative time range
        analyticsRequest.time_window = timeWindow;
    }

    return new Promise<NextResponse>((resolve) => {
        client.GetAnalytics(analyticsRequest, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetAnalytics Error:', err);
                // Return empty/mock data on error so the page doesn't crash
                return resolve(
                    NextResponse.json({
                        request_rate: [],
                        status_distribution: [],
                        top_endpoints: [],
                        latency_trend: []
                    })
                );
            }
            resolve(NextResponse.json(response || {}));
        });
    });
}
