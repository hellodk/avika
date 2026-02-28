import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';

const lookup = promisify(dns.lookup);

export async function GET() {
    // Get gateway address from environment (server-side can resolve K8s DNS)
    const gatewayHost = process.env.GATEWAY_HTTP_URL?.replace(/^https?:\/\//, '').split(':')[0] || 'avika-gateway';
    const gatewayHttpPort = process.env.AVIKA_GATEWAY_SERVICE_PORT_HTTP || '5021';
    
    let gatewayIp = gatewayHost;
    
    // Try to resolve the K8s service name to an IP
    try {
        const result = await lookup(gatewayHost);
        gatewayIp = result.address;
    } catch (e) {
        // If DNS resolution fails, check if we have the service IP from K8s env vars
        if (process.env.AVIKA_GATEWAY_SERVICE_HOST) {
            gatewayIp = process.env.AVIKA_GATEWAY_SERVICE_HOST;
        }
        // Otherwise, keep the original hostname (might work if directly accessible)
    }
    
    return NextResponse.json({
        gateway: {
            wsUrl: `ws://${gatewayIp}:${gatewayHttpPort}`,
            httpUrl: `http://${gatewayIp}:${gatewayHttpPort}`,
            host: gatewayIp,
            httpPort: gatewayHttpPort,
        }
    });
}
