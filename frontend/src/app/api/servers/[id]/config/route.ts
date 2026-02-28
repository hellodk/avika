import { NextRequest, NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

const GATEWAY_HOST = process.env.GATEWAY_HOST || 'localhost';
const GATEWAY_PORT = process.env.GATEWAY_PORT || '5020';

// GET /api/servers/[id]/config - Get agent configuration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const gatewayAddress = `${GATEWAY_HOST}:${GATEWAY_PORT}`;

    // Return default config with gateway info
    // In production, this would fetch from the agent via gRPC
    return NextResponse.json({
        agent_id: id,
        gateway_addresses: [gatewayAddress],
        multi_gateway_mode: false,
        nginx_status_url: 'http://127.0.0.1/nginx_status',
        access_log_path: '/var/log/nginx/access.log',
        error_log_path: '/var/log/nginx/error.log',
        nginx_config_path: '/etc/nginx/nginx.conf',
        log_format: 'combined',
        log_level: 'info',
        health_port: 5026,
        mgmt_port: 5025,
        update_server: '',
        update_interval_seconds: 604800,
        metrics_interval_seconds: 1,
        heartbeat_interval_seconds: 1,
        enable_vts_metrics: true,
        enable_log_streaming: true,
        auto_apply_config: true,
    });
}

// POST /api/servers/[id]/config - Update agent configuration
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    // In a full implementation, this would use gRPC to push config to the agent
    // For now, we'll simulate success
    const requiresRestart = body.gateway_addresses?.length > 1 || body.multi_gateway_mode;
    
    return NextResponse.json({
        success: true,
        message: 'Configuration queued for delivery (agent will receive on next heartbeat)',
        requires_restart: requiresRestart,
    });
}
