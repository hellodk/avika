import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import { normalizeServerId } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    
    try {
        const body = await request.json();
        const client = getAgentServiceClient();

        // Map frontend JSON to gRPC UploadCertificateRequest
        const reqPayload = {
            domain: body.domain || "custom",
            cert_content: Buffer.from(body.cert_content || ""),
            key_content: Buffer.from(body.key_content || ""),
            chain_content: body.chain_content ? Buffer.from(body.chain_content) : undefined,
            cert_type: "manual",
            agent_ids: [id],
            backup_existing: true,
            reload_nginx: body.reload_nginx !== false,
        };

        return new Promise<NextResponse>((resolve) => {
            client.UploadCertificate(reqPayload, (err: any, response: any) => {
                if (err) {
                    console.error("gRPC UploadCertificate Error:", err);
                    return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                }
                resolve(NextResponse.json(response));
            });
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    
    try {
        const url = new URL(request.url);
        const certId = url.searchParams.get("cert_id") || url.searchParams.get("domain");
        if (!certId) {
            return NextResponse.json({ error: "cert_id or domain is required" }, { status: 400 });
        }

        const client = getAgentServiceClient();

        return new Promise<NextResponse>((resolve) => {
            client.DeleteCertificate({ certificate_id: certId, agent_ids: [id] }, (err: any, response: any) => {
                if (err) {
                    console.error("gRPC DeleteCertificate Error:", err);
                    return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                }
                resolve(NextResponse.json(response));
            });
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
