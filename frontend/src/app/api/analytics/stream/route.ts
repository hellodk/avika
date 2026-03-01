import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agent_id') || 'all';
    const timeWindow = searchParams.get('window') || '1h';
    const environmentId = searchParams.get('environment_id');
    const projectId = searchParams.get('project_id');

    const client = getAgentServiceClient();

    // Build request with project/environment filter
    const analyticsRequest: any = {
        time_window: timeWindow
    };
    
    if (environmentId) {
        analyticsRequest.environment_id = environmentId;
    } else if (projectId) {
        analyticsRequest.project_id = projectId;
    } else if (agentId && agentId !== 'all') {
        analyticsRequest.agent_id = agentId;
    }

    const stream = new ReadableStream({
        start(controller) {
            const grpcStream = client.StreamAnalytics(analyticsRequest);

            grpcStream.on('data', (data: any) => {
                // Formatting according to SSE spec: data: <json>\n\n
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            });

            grpcStream.on('error', (err: any) => {
                console.error('SSE gRPC Error:', err);
                // We don't want to crash the whole stream for one error, 
                // but if the gRPC stream dies, the SSE stream should too.
                try {
                    controller.close();
                } catch (e) {
                    // Ignore if already closed
                }
            });

            grpcStream.on('end', () => {
                try {
                    controller.close();
                } catch (e) { }
            });

            // Ensure we clean up gRPC stream when client disconnects
            req.signal.addEventListener('abort', () => {
                if (grpcStream.cancel) {
                    grpcStream.cancel();
                }
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Content-Encoding': 'none',
        },
    });
}
