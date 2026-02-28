import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';

const lookup = promisify(dns.lookup);

export async function GET(request: Request) {
    // Get the request's host to determine external access URL
    const requestHost = request.headers.get('host')?.split(':')[0] || 'localhost';
    
    // Check for explicit external gateway URL (for browser WebSocket access)
    // This should be set to the externally accessible gateway address
    const externalGatewayUrl = process.env.GATEWAY_EXTERNAL_URL;
    const gatewayNodePort = process.env.GATEWAY_HTTP_NODEPORT || '30521';
    
    // Internal gateway for server-side calls
    const gatewayHost = process.env.GATEWAY_HTTP_URL?.replace(/^https?:\/\//, '').split(':')[0] || 'avika-gateway';
    const gatewayHttpPort = process.env.AVIKA_GATEWAY_SERVICE_PORT_HTTP || '5021';
    
    let gatewayIp = gatewayHost;
    
    // Try to resolve the K8s service name to an IP
    try {
        const result = await lookup(gatewayHost);
        gatewayIp = result.address;
    } catch (e) {
        if (process.env.AVIKA_GATEWAY_SERVICE_HOST) {
            gatewayIp = process.env.AVIKA_GATEWAY_SERVICE_HOST;
        }
    }
    
    // For WebSocket URLs (browser access), use external URL or gateway ClusterIP
    let wsHost = gatewayIp;
    let wsPort = gatewayHttpPort;
    
    if (externalGatewayUrl) {
        // Use explicitly configured external URL
        const url = new URL(externalGatewayUrl);
        wsHost = url.hostname;
        wsPort = url.port || '5021';
    }
    // Otherwise use the gateway's internal IP/port (works if browser can reach ClusterIPs)
    
    return NextResponse.json({
        gateway: {
            wsUrl: `ws://${wsHost}:${wsPort}`,
            httpUrl: `http://${gatewayIp}:${gatewayHttpPort}`,
            host: gatewayIp,
            httpPort: gatewayHttpPort,
        }
    });
}
