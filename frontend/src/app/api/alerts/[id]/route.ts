import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';
import { isGrpcExplicitFailure } from '@/lib/grpc-success';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const client = getAgentServiceClient();
    console.log(`DELETE /api/alerts/${id} - removing rule`);

    return new Promise<NextResponse>((resolve) => {
        client.DeleteAlertRule({ id }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC DeleteAlertRule Error:', err);
                return resolve(
                    NextResponse.json({ error: 'Failed to remove alert rule' }, { status: 500 })
                );
            }
            if (isGrpcExplicitFailure(response)) {
                return resolve(
                    NextResponse.json({ error: 'Gateway refused to delete alert rule' }, { status: 502 })
                );
            }
            resolve(NextResponse.json({ success: true }));
        });
    });
}
