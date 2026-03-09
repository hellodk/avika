
import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import { normalizeServerId } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const client = getAgentServiceClient();
    console.log(`GET /api/servers/${id} - extracting details`);

    return new Promise<NextResponse>((resolve) => {
        // Fetch basic agent info
        client.GetAgent({ agent_id: id }, (err: any, agent: any) => {
            if (err) {
                console.error('gRPC GetAgent Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to fetch agent info' }, { status: 500 })
                );
            }

            // Also fetch config and certificates in parallel or return them as sub-resources
            // For now, let's fetch config and certs to provide a full "details" view
            client.GetConfig({ instance_id: id }, (configErr: any, config: any) => {
                client.ListCertificates({ instance_id: id }, (certErr: any, certs: any) => {
                    resolve(NextResponse.json({
                        ...agent,
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
                resolve(NextResponse.json(response));
            });
        } else if (action === 'restart') {
            client.RestartNginx({ instance_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
                resolve(NextResponse.json({ success: response?.success ?? true, error: response?.error }));
            });
        } else if (action === 'stop') {
            client.StopNginx({ instance_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
                resolve(NextResponse.json({ success: response?.success ?? true, error: response?.error }));
            });
        } else if (action === 'update_config') {
            client.UpdateConfig({
                instance_id: id,
                new_content: content,
                backup: backup || true
            }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                resolve(NextResponse.json(response));
            });
        } else if (action === 'update_agent') {
            client.UpdateAgent({ agent_id: id }, (err: any, response: any) => {
                if (err) return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                resolve(NextResponse.json(response));
            });
        } else {
            resolve(NextResponse.json({ error: 'Invalid action' }, { status: 400 }));
        }
    });
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const client = getAgentServiceClient();
    console.log(`DELETE /api/servers/${id} - removing agent`);

    return new Promise<NextResponse>((resolve) => {
        client.RemoveAgent({ agent_id: id }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to remove agent' }, { status: 500 })
                );
            }
            resolve(NextResponse.json({ success: true }));
        });
    });
}
