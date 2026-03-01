import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('window') || '1h';
    const limit = parseInt(searchParams.get('limit') || '50');
    const agentId = searchParams.get('agent_id') || 'all';
    const environmentId = searchParams.get('environment_id');
    const projectId = searchParams.get('project_id');

    const client = getAgentServiceClient();

    // Prepare request object
    const req: any = {
        time_window: timeWindow,
        limit: limit,
        status_filter: searchParams.get('status') || '',
        method_filter: searchParams.get('method') || '',
        uri_filter: searchParams.get('uri') || ''
    };
    
    // Project/environment filtering takes precedence
    if (environmentId) {
        req.environment_id = environmentId;
    } else if (projectId) {
        req.project_id = projectId;
    } else if (agentId && agentId !== 'all') {
        req.agent_id = agentId;
    }

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
