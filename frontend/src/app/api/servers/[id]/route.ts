import { NextRequest, NextResponse } from 'next/server';
import { getGatewayUrl } from '@/lib/gateway-url';
import { gatewayProxyCookieHeaders } from '@/lib/gateway-proxy-headers';
import { getAgentServiceClient } from '@/lib/grpc-client';
import { normalizeServerId } from '@/lib/api';
import { isGrpcExplicitFailure } from '@/lib/grpc-success';
import { serversDeleteUsesGrpc } from '@/lib/servers-bff-transport';

export const dynamic = 'force-dynamic';

// gRPC status code NOT_FOUND (grpc-js)
const GRPC_NOT_FOUND = 5;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    if (!id) {
        return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    let client;
    try {
        client = getAgentServiceClient();
    } catch (e) {
        console.error('GetAgentServiceClient failed:', e);
        return NextResponse.json(
            { error: 'Agent service unavailable' },
            { status: 503 }
        );
    }

    console.log(`GET /api/servers/${id} - extracting details`);

    return new Promise<NextResponse>((resolve) => {
        client.GetAgent({ agent_id: id }, (err: any, agent: any) => {
            if (err) {
                console.error('gRPC GetAgent Error:', err);
                const isNotFound =
                    err.code === GRPC_NOT_FOUND ||
                    (typeof err.message === 'string' && /not found|unknown agent/i.test(err.message));
                return resolve(
                    NextResponse.json(
                        { error: isNotFound ? 'Agent not found' : 'Failed to fetch agent info' },
                        { status: isNotFound ? 404 : 500 }
                    )
                );
            }
            if (!agent) {
                return resolve(
                    NextResponse.json({ error: 'Agent not found' }, { status: 404 })
                );
            }

            // Fetch config and certificates
            client.GetConfig({ instance_id: id }, (configErr: any, config: any) => {
                client.ListCertificates({ instance_id: id }, (certErr: any, certs: any) => {
                    const normalizedAgent = {
                        ...(agent || {}),
                        agent_id: agent?.agentId || agent?.agent_id || agent?.id,
                        agent_version: agent?.agentVersion || agent?.agent_version,
                        instances_count: agent?.instancesCount || agent?.instances_count,
                        last_seen: agent?.lastSeen || agent?.last_seen,
                        is_pod: agent?.isPod || agent?.is_pod,
                        pod_ip: agent?.podIp || agent?.pod_ip,
                        psk_authenticated: agent?.pskAuthenticated || agent?.psk_authenticated,
                        build_date: agent?.buildDate || agent?.build_date,
                        git_commit: agent?.gitCommit || agent?.git_commit,
                        git_branch: agent?.gitBranch || agent?.git_branch,
                    };
                    resolve(NextResponse.json({
                        ...normalizedAgent,
                        config: config?.config || null,
                        certificates: certs?.certificates || [],
                        configError: configErr?.message || null,
                        certError: certErr?.message || null,
                    }));
                });
            });
        });
    });
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const { action, content, backup } = await request.json();
    const client = getAgentServiceClient();
    console.log(`POST /api/servers/${id} - action: ${action}`);

    return new Promise<NextResponse>((resolve) => {
        if (action === 'reload') {
            client.ReloadNginx({ instance_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { success: false, error: response?.error || 'Reload rejected by agent' },
                            { status: 502 }
                        )
                    );
                }
                resolve(NextResponse.json(response));
            });
        } else if (action === 'restart') {
            client.RestartNginx({ instance_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { success: false, error: response?.error || 'Restart rejected by agent' },
                            { status: 502 }
                        )
                    );
                }
                resolve(NextResponse.json({ success: response?.success ?? true, error: response?.error }));
            });
        } else if (action === 'stop') {
            client.StopNginx({ instance_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { success: false, error: response?.error || 'Stop rejected by agent' },
                            { status: 502 }
                        )
                    );
                }
                resolve(NextResponse.json({ success: response?.success ?? true, error: response?.error }));
            });
        } else if (action === 'update_config') {
            client.UpdateConfig({
                instance_id: id,
                new_content: content,
                backup: backup || true
            }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { success: false, error: response?.error || 'Config update rejected' },
                            { status: 502 }
                        )
                    );
                }
                resolve(NextResponse.json(response));
            });
        } else if (action === 'update_agent') {
            client.UpdateAgent({ agent_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { error: response?.message || 'Update failed' },
                            { status: 400 }
                        )
                    );
                }
                resolve(NextResponse.json(response));
            });
        } else {
            resolve(NextResponse.json({ error: 'Invalid action' }, { status: 400 }));
        }
    });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    if (!id) {
        return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    if (serversDeleteUsesGrpc()) {
        let client;
        try {
            client = getAgentServiceClient();
        } catch (e) {
            console.error('GetAgentServiceClient failed:', e);
            return NextResponse.json({ error: 'Agent service unavailable' }, { status: 503 });
        }
        console.log(`DELETE /api/servers/${id} - removing agent (gRPC)`);
        return new Promise<NextResponse>((resolve) => {
            client.RemoveAgent({ agent_id: id }, (err: unknown, response: Record<string, unknown>) => {
                if (err) {
                    console.error('gRPC Error:', err);
                    return resolve(
                        NextResponse.json({ error: 'Failed to remove agent' }, { status: 500 })
                    );
                }
                if (isGrpcExplicitFailure(response)) {
                    return resolve(
                        NextResponse.json(
                            { error: 'Gateway refused removal (agent not found or DB error)' },
                            { status: 502 }
                        )
                    );
                }
                resolve(NextResponse.json({ success: true }));
            });
        });
    }

    const gatewayUrl = getGatewayUrl();
    const url = `${gatewayUrl}/api/servers/${encodeURIComponent(id)}`;
    console.log(`DELETE /api/servers/${id} - removing agent (HTTP → gateway)`);

    try {
        const gwRes = await fetch(url, {
            method: 'DELETE',
            headers: gatewayProxyCookieHeaders(request),
        });
        const text = await gwRes.text();
        let body: Record<string, unknown> = {};
        if (text) {
            try {
                body = JSON.parse(text) as Record<string, unknown>;
            } catch {
                return NextResponse.json(
                    { error: 'Invalid JSON from gateway' },
                    { status: 502 }
                );
            }
        }
        return NextResponse.json(body, { status: gwRes.status });
    } catch (e) {
        console.error('HTTP DELETE to gateway failed:', e);
        return NextResponse.json({ error: 'Failed to connect to gateway' }, { status: 502 });
    }
}
