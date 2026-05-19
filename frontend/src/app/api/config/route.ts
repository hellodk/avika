import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';

const lookup = promisify(dns.lookup);

export async function GET(request: Request) {
    // Check for explicit external gateway URL (cluster FQDN; supports http and https)
    const externalGatewayUrl = process.env.GATEWAY_EXTERNAL_URL;

    // Internal gateway for server-side calls
    const gatewayHost = process.env.GATEWAY_HTTP_URL?.replace(/^https?:\/\//, '').split(':')[0] || 'avika-gateway';
    let gatewayHttpPort = process.env.AVIKA_GATEWAY_SERVICE_PORT_HTTP || '5021';

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

    let httpUrl: string;
    let wsUrl: string;

    if (externalGatewayUrl) {
        // Use explicitly configured external URL (cluster FQDN); supports both http and https
        const url = new URL(externalGatewayUrl);
        const scheme = url.protocol === 'https:' ? 'https' : 'http';
        const wsScheme = url.protocol === 'https:' ? 'wss' : 'ws';
        const port = url.port || (scheme === 'https' ? '443' : '80');
        const hostPort = url.port ? `${url.hostname}:${url.port}` : url.hostname;
        httpUrl = `${scheme}://${hostPort}`;
        wsUrl = `${wsScheme}://${hostPort}`;
        gatewayIp = url.hostname;
        gatewayHttpPort = port;
    } else {
        httpUrl = `http://${gatewayIp}:${gatewayHttpPort}`;
        wsUrl = `ws://${wsHost}:${wsPort}`;
    }

    const grpcPort =
        process.env.GATEWAY_GRPC_PORT ||
        process.env.AVIKA_GATEWAY_SERVICE_PORT_GRPC ||
        "5020";

    return NextResponse.json({
        gateway: {
            wsUrl,
            httpUrl,
            host: gatewayIp,
            httpPort: gatewayHttpPort,
            /** Agent gRPC port (for install one-liner / docs); host is same logical gateway as `host`. */
            grpcPort,
        }
    });
}
