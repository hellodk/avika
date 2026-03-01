import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const timeWindow = searchParams.get('window') || '24h';
    const agentId = searchParams.get('agent_id');
    const environmentId = searchParams.get('environment_id');
    const projectId = searchParams.get('project_id');

    const client = getAgentServiceClient();

    const analyticsRequest: any = {
        time_window: timeWindow,
    };
    
    // Project/environment filtering takes precedence
    if (environmentId) {
        analyticsRequest.environment_id = environmentId;
    } else if (projectId) {
        analyticsRequest.project_id = projectId;
    } else if (agentId && agentId !== 'all') {
        analyticsRequest.agent_id = agentId;
    }

    return new Promise<NextResponse>((resolve) => {
        client.GetAnalytics(analyticsRequest, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetAnalytics Error for export:', err);
                return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
            }

            if (format === 'csv') {
                const csvData = convertToCSV(response);
                return resolve(new NextResponse(csvData, {
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': `attachment; filename=nginx_analytics_${agentId || 'fleet'}_${timeWindow}.csv`
                    }
                }));
            }

            // Default to JSON
            return resolve(NextResponse.json(response, {
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename=nginx_analytics_${agentId || 'fleet'}_${timeWindow}.json`
                }
            }));
        });
    });
}

function convertToCSV(data: any): string {
    const lines: string[] = [];

    // 1. Request Rate
    if (data.request_rate && data.request_rate.length > 0) {
        lines.push('--- REQUEST RATE ---');
        lines.push('Timestamp,Requests Per Second');
        data.request_rate.forEach((item: any) => {
            lines.push(`${new Date(item.timestamp).toISOString()},${item.value}`);
        });
        lines.push('');
    }

    // 2. Status Distribution
    if (data.status_distribution && data.status_distribution.length > 0) {
        lines.push('--- STATUS DISTRIBUTION ---');
        lines.push('Status Code,Count');
        data.status_distribution.forEach((item: any) => {
            lines.push(`${item.name},${item.value}`);
        });
        lines.push('');
    }

    // 3. System Metrics (CPU/Memory)
    if (data.cpu_usage && data.cpu_usage.length > 0) {
        lines.push('--- CPU USAGE ---');
        lines.push('Timestamp,CPU %');
        data.cpu_usage.forEach((item: any) => {
            lines.push(`${new Date(item.timestamp).toISOString()},${item.value}`);
        });
        lines.push('');
    }

    if (data.memory_usage && data.memory_usage.length > 0) {
        lines.push('--- MEMORY USAGE ---');
        lines.push('Timestamp,Memory %');
        data.memory_usage.forEach((item: any) => {
            lines.push(`${new Date(item.timestamp).toISOString()},${item.value}`);
        });
        lines.push('');
    }

    // 4. NGINX Connections
    if (data.connections && data.connections.length > 0) {
        lines.push('--- NGINX CONNECTIONS ---');
        lines.push('Timestamp,Active Connections');
        data.connections.forEach((item: any) => {
            lines.push(`${new Date(item.timestamp).toISOString()},${item.value}`);
        });
        lines.push('');
    }

    return lines.join('\n');
}
