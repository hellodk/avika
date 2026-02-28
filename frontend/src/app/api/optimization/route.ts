
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.GetRecommendations({}, (err: any, response: any) => {
            if (err) {
                console.error('gRPC GetRecommendations Error:', err);
                return resolve(NextResponse.json({ recommendations: [] }));
            }
            resolve(NextResponse.json(response || { recommendations: [] }));
        });
    });
}

export async function POST(req: Request) {
    const body = await req.json();
    const { agent_id, recommendation_id, suggested_config, context, server } = body;

    const client = getAgentServiceClient();

    // Construct the ConfigAugment message
    const augment = {
        augment_id: `rec-${recommendation_id}-${Date.now()}`,
        name: `AI Optimization: ${recommendation_id}`,
        snippet: suggested_config,
        context: context || "http", // Default to http context if not specified
    };

    const request = {
        instance_id: agent_id || server, // Use server name as fallback ID if agent_id missing
        augment: augment
    };

    return new Promise<NextResponse>((resolve) => {
        client.ApplyAugment(request, (err: any, response: any) => {
            if (err) {
                console.error('gRPC ApplyAugment Error:', err);
                return resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
            }
            resolve(NextResponse.json(response));
        });
    });
}
