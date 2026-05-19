
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

const emptyAnalyticsBody = {
    request_rate: [],
    status_distribution: [],
    top_endpoints: [],
    latency_trend: [],
    latency_distribution: [],
    summary: {},
};

function grpcErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
        return (err as { message: string }).message;
    }
    return String(err);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('window') || '24h';
    const fromTimestamp = searchParams.get('from');
    const toTimestamp = searchParams.get('to');
    const timezone = searchParams.get('timezone') || 'UTC';

    let client: ReturnType<typeof getAgentServiceClient>;
    try {
        client = getAgentServiceClient();
    } catch (e) {
        console.error('Analytics route: failed to create gRPC client:', e);
        return NextResponse.json({
            ...emptyAnalyticsBody,
            proxy_error: true,
            proxy_error_message:
                grpcErrorMessage(e) ||
                'gRPC client init failed. Check proto paths and GATEWAY_GRPC_ADDR / TLS env in the Next.js server.',
        });
    }

    const agentId = searchParams.get('agent_id');
    const environmentId = searchParams.get('environment_id');
    const projectId = searchParams.get('project_id');
    
    const analyticsRequest: Record<string, unknown> = {
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
        analyticsRequest.from_timestamp = parseInt(fromTimestamp, 10);
        analyticsRequest.to_timestamp = parseInt(toTimestamp, 10);
    } else {
        // Relative time range
        analyticsRequest.time_window = timeWindow;
    }

    return new Promise<NextResponse>((resolve) => {
        client.GetAnalytics(analyticsRequest, (err: unknown, response: unknown) => {
            if (err) {
                console.error('gRPC GetAnalytics Error:', err);
                return resolve(
                    NextResponse.json({
                        ...emptyAnalyticsBody,
                        proxy_error: true,
                        proxy_error_message: grpcErrorMessage(err),
                    })
                );
            }
            resolve(NextResponse.json((response as object) || {}));
        });
    });
}
