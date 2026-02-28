
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { agent_id, template, config } = body;

        if (!agent_id || !template) {
            return NextResponse.json({ success: false, error: 'agent_id and template are required' }, { status: 400 });
        }

        const snippet = generateSnippet(template, config || {});

        const client = getAgentServiceClient();

        const augmentRequest = {
            instance_id: agent_id,
            augment: {
                augment_id: `${template}-${Date.now()}`,
                name: template,
                snippet: snippet,
                context: 'http' // Default context, template might override or define context in snippet if wrapped properly
            }
        };

        return new Promise<NextResponse>((resolve) => {
            client.ApplyAugment(augmentRequest, (err: any, response: any) => {
                if (err) {
                    console.error('gRPC ApplyAugment Error:', err);
                    return resolve(NextResponse.json({ success: false, error: err.message || 'gRPC error' }, { status: 500 }));
                }
                resolve(NextResponse.json(response));
            });
        });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

function generateSnippet(template: string, config: any): string {
    switch (template) {
        case 'rate-limiting':
            const limit = config.requests_per_minute || 60;
            const burst = config.burst_size || 10;
            return `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=${limit}r/m;

server {
    location /api/ {
        limit_req zone=api_limit burst=${burst} nodelay;
        proxy_pass http://backend;
    }
}`;

        case 'health-checks':
            const upstream = config.upstream_name || 'backend';
            const interval = config.interval || 3000;
            const rise = config.rise || 2;
            const fall = config.fall || 3;
            // Note: 'check' directive is NGINX Plus or Tengine. 
            // For standard NGINX, passive health checks (max_fails) are used.
            // We'll output a standard upstream block with max_fails.
            return `upstream ${upstream} {
    server ${config.servers || 'backend:8080'} max_fails=${fall} fail_timeout=${interval}ms;
}`;

        case 'location-blocks':
            return `location ${config.path || '/'} {
    ${config.directives || '# Add directives here'}
}`;

        case 'custom-404':
            return `error_page 404 ${config.page_path || '/404.html'};
location = ${config.page_path || '/404.html'} {
    root /usr/share/nginx/html;
    internal;
}`;

        case 'custom-500':
            return `error_page 500 502 503 504 ${config.page_path || '/50x.html'};
location = ${config.page_path || '/50x.html'} {
    root /usr/share/nginx/html;
    internal;
}`;

        case 'upstream-groups':
            return `upstream ${config.name || 'app_upstream'} {
    ${config.servers || 'server 127.0.0.1:8080;'}
}`;

        case 'openid-connect':
            // Simplified OIDC snippet
            return `# OIDC Configuration
auth_jwt "Restricted Area";
auth_jwt_key_file ${config.key_file || '/etc/nginx/jwt_key.jwk'};
`;

        default:
            return `# Template '${template}' not found`;
    }
}
