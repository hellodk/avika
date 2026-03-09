import { NextResponse } from 'next/server';
import { getAgentServiceClient } from '@/lib/grpc-client';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const start = parseInt(searchParams.get('start') || '0');
    const end = parseInt(searchParams.get('end') || '0');
    const agentIds = searchParams.get('agent_ids')?.split(',').filter(Boolean) || [];
    const format = (searchParams.get('format') || 'pdf').toLowerCase(); // pdf | excel | xlsx

    const client = getAgentServiceClient();

    return new Promise<NextResponse>((resolve) => {
        client.DownloadReport({
            start_time: start,
            end_time: end,
            agent_ids: agentIds,
            report_type: 'summary',
            format: format === 'excel' || format === 'xlsx' ? 'excel' : 'pdf',
        }, (err: any, response: any) => {
            if (err) {
                console.error('gRPC DownloadReport Error:', err);
                return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
            }

            if (!response?.content) {
                return resolve(NextResponse.json({ error: 'No report content returned' }, { status: 500 }));
            }

            const buffer = Buffer.from(response.content);
            const fileName = response.file_name || `avika-report-${Date.now()}.pdf`;

            return resolve(new NextResponse(buffer, {
                status: 200,
                headers: {
                    'Content-Type': response.content_type || 'application/pdf',
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                    'Content-Length': buffer.length.toString(),
                },
            }));
        });
    });
}
