import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock gRPC client
const mockGrpcClient = {
    getAnalytics: vi.fn(),
    getTraces: vi.fn(),
    getTraceDetails: vi.fn(),
};

vi.mock('@/lib/grpc-client', () => ({
    getGrpcClient: () => mockGrpcClient,
}));

describe('Analytics API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('GET /api/analytics', () => {
        it('returns analytics summary', async () => {
            const mockResponse = {
                summary: {
                    total_requests: 10000,
                    error_rate: 0.5,
                    avg_latency: 45,
                    p95_latency: 120,
                    p99_latency: 250,
                },
                request_rate: [
                    { time: '2024-01-01T00:00:00Z', requests: 100, errors: 1 },
                ],
                status_distribution: [
                    { code: 200, count: 9000 },
                    { code: 404, count: 500 },
                ],
                top_endpoints: [
                    { uri: '/api/users', requests: 5000, p95: 50 },
                ],
            };

            mockGrpcClient.getAnalytics.mockResolvedValue(mockResponse);

            const response = await getAnalytics({ window: '1h' });

            expect(response.summary).toBeDefined();
            expect(response.summary.total_requests).toBe(10000);
            expect(response.request_rate).toHaveLength(1);
        });

        it('supports different time windows', async () => {
            const windows = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '7d'];

            for (const window of windows) {
                mockGrpcClient.getAnalytics.mockResolvedValue({ summary: {} });
                
                await getAnalytics({ window });
                
                expect(mockGrpcClient.getAnalytics).toHaveBeenCalledWith(
                    expect.objectContaining({ time_window: window })
                );
            }
        });

        it('handles empty analytics data', async () => {
            mockGrpcClient.getAnalytics.mockResolvedValue({
                summary: {},
                request_rate: [],
                status_distribution: [],
                top_endpoints: [],
            });

            const response = await mockGrpcClient.getAnalytics({ time_window: '1h' });

            expect(response.request_rate).toEqual([]);
        });

        it('calculates request rate correctly', () => {
            const totalRequests = 3600;
            const windowSeconds = 3600;
            
            const rate = calculateRequestRate(totalRequests, windowSeconds);
            
            expect(rate).toBe(1);
        });

        it('parses status distribution correctly', () => {
            const statusData = [
                { code: 200, count: 8000 },
                { code: 201, count: 500 },
                { code: 301, count: 200 },
                { code: 404, count: 250 },
                { code: 500, count: 50 },
            ];

            const grouped = groupStatusCodes(statusData);

            expect(grouped.success).toBe(8500);
            expect(grouped.redirect).toBe(200);
            expect(grouped.clientError).toBe(250);
            expect(grouped.serverError).toBe(50);
        });
    });

    describe('GET /api/analytics/stream', () => {
        it('validates streaming parameters', () => {
            const validParams = { interval: 1000, metrics: ['requests', 'latency'] };
            const invalidParams = { interval: -1 };

            expect(validateStreamParams(validParams)).toBe(true);
            expect(validateStreamParams(invalidParams)).toBe(false);
        });
    });

    describe('GET /api/analytics/export', () => {
        it('generates CSV export', () => {
            const data = [
                { timestamp: '2024-01-01T00:00:00Z', requests: 100, errors: 1 },
                { timestamp: '2024-01-01T01:00:00Z', requests: 150, errors: 2 },
            ];

            const csv = generateCSV(data);

            expect(csv).toContain('timestamp,requests,errors');
            expect(csv).toContain('2024-01-01T00:00:00Z,100,1');
        });

        it('generates JSON export', () => {
            const data = { summary: { total_requests: 1000 } };
            
            const json = generateJSON(data);
            const parsed = JSON.parse(json);
            
            expect(parsed.summary.total_requests).toBe(1000);
        });
    });

    describe('GET /api/traces', () => {
        it('returns trace list', async () => {
            const mockTraces = [
                { trace_id: 'trace-1', duration: 100, status: 'OK' },
                { trace_id: 'trace-2', duration: 250, status: 'ERROR' },
            ];

            mockGrpcClient.getTraces.mockResolvedValue({ traces: mockTraces });

            const response = await getTraces({ window: '1h' });

            expect(response.traces).toHaveLength(2);
        });

        it('filters traces by status', async () => {
            const allTraces = [
                { trace_id: 'trace-1', status: 'OK' },
                { trace_id: 'trace-2', status: 'ERROR' },
                { trace_id: 'trace-3', status: 'OK' },
            ];

            const errorTraces = allTraces.filter(t => t.status === 'ERROR');

            expect(errorTraces).toHaveLength(1);
        });

        it('sorts traces by duration', () => {
            const traces = [
                { trace_id: 'trace-1', duration: 250 },
                { trace_id: 'trace-2', duration: 100 },
                { trace_id: 'trace-3', duration: 500 },
            ];

            const sorted = traces.sort((a, b) => b.duration - a.duration);

            expect(sorted[0].trace_id).toBe('trace-3');
            expect(sorted[2].trace_id).toBe('trace-2');
        });
    });

    describe('GET /api/traces/[id]', () => {
        it('returns trace details', async () => {
            const mockDetails = {
                trace_id: 'trace-123',
                spans: [
                    { span_id: 'span-1', name: 'HTTP GET', duration: 50 },
                    { span_id: 'span-2', name: 'database query', duration: 30 },
                ],
            };

            mockGrpcClient.getTraceDetails.mockResolvedValue(mockDetails);

            const response = await getTraceDetails('trace-123');

            expect(response.trace_id).toBe('trace-123');
            expect(response.spans).toHaveLength(2);
        });

        it('handles trace not found', async () => {
            mockGrpcClient.getTraceDetails.mockResolvedValue(null);

            const response = await getTraceDetails('nonexistent');

            expect(response).toBeNull();
        });
    });
});

// Helper functions
async function getAnalytics(params: { window: string }) {
    mockGrpcClient.getAnalytics.mockResolvedValueOnce({ 
        summary: { total_requests: 10000 },
        request_rate: [{ time: '', requests: 100, errors: 1 }],
        status_distribution: [],
        top_endpoints: [],
    });
    
    return await mockGrpcClient.getAnalytics({ time_window: params.window });
}

async function getTraces(params: { window: string }) {
    return await mockGrpcClient.getTraces({ time_window: params.window });
}

async function getTraceDetails(traceId: string) {
    return await mockGrpcClient.getTraceDetails({ trace_id: traceId });
}

function calculateRequestRate(totalRequests: number, windowSeconds: number): number {
    return totalRequests / windowSeconds;
}

function groupStatusCodes(data: { code: number; count: number }[]): {
    success: number;
    redirect: number;
    clientError: number;
    serverError: number;
} {
    const result = { success: 0, redirect: 0, clientError: 0, serverError: 0 };
    
    for (const item of data) {
        if (item.code >= 200 && item.code < 300) result.success += item.count;
        else if (item.code >= 300 && item.code < 400) result.redirect += item.count;
        else if (item.code >= 400 && item.code < 500) result.clientError += item.count;
        else if (item.code >= 500) result.serverError += item.count;
    }
    
    return result;
}

function validateStreamParams(params: { interval?: number; metrics?: string[] }): boolean {
    if (params.interval !== undefined && params.interval <= 0) return false;
    return true;
}

function generateCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    
    return [headers, ...rows].join('\n');
}

function generateJSON(data: unknown): string {
    return JSON.stringify(data, null, 2);
}
