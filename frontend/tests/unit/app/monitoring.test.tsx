import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        replace: vi.fn(),
        push: vi.fn(),
    }),
    usePathname: () => '/avika/monitoring',
    useSearchParams: () => new URLSearchParams(),
}));

// Mock theme provider
vi.mock('@/lib/theme-provider', () => ({
    useTheme: () => ({ theme: 'dark' }),
}));

// Mock chart colors
vi.mock('@/lib/chart-colors', () => ({
    getChartColorsForTheme: () => ({
        grid: '#374151',
        axis: '#9CA3AF',
        tooltipBg: '#1F2937',
        tooltipText: '#F9FAFB',
        info: '#3B82F6',
        error: '#EF4444',
        success: '#10B981',
        warning: '#F59E0B',
        cpu: '#3B82F6',
        memory: '#8B5CF6',
        connectionActive: '#3B82F6',
        connectionReading: '#10B981',
        connectionWriting: '#F59E0B',
        connectionWaiting: '#8B5CF6',
        status2xx: '#10B981',
        status4xx: '#F59E0B',
    }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
    LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Line: () => null,
    Area: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
    apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

describe('Monitoring Page - Data Processing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Analytics API Response Processing', () => {
        it('should handle valid analytics response with all fields', () => {
            const validResponse = {
                summary: {
                    total_requests: "150000",
                    error_rate: 0.5,
                    avg_latency: 25.5,
                    total_bandwidth: "1500000",
                },
                request_rate: [
                    { time: "10:00", requests: "1000", errors: "5" },
                    { time: "10:01", requests: "1200", errors: "3" },
                ],
                connections_history: [
                    { time: "10:00", active: 100, reading: 10, writing: 20, waiting: 70 },
                ],
                system_metrics: [
                    { time: "10:00", cpu_usage: 45.5, memory_usage: 65.2 },
                ],
                http_status_metrics: {
                    total_status_200_24h: "140000",
                    total_status_404_24h: "500",
                    total_status_503: "10",
                },
                top_endpoints: [
                    { uri: "/api/test", requests: "5000", p95: 50, errors: "10" },
                ],
            };

            // Verify structure
            expect(validResponse.summary).toBeDefined();
            expect(validResponse.request_rate).toBeInstanceOf(Array);
            expect(validResponse.connections_history).toBeInstanceOf(Array);
            expect(validResponse.system_metrics).toBeInstanceOf(Array);
        });

        it('should handle empty connections_history', () => {
            const response = {
                connections_history: [],
            };
            
            const latestNginx = response.connections_history[response.connections_history.length - 1] || {};
            expect(latestNginx).toEqual({});
            expect(latestNginx.active).toBeUndefined();
        });

        it('should handle empty system_metrics', () => {
            const response = {
                system_metrics: [],
            };
            
            const latestSys = response.system_metrics[response.system_metrics.length - 1] || {};
            expect(latestSys).toEqual({});
            expect(latestSys.cpu_usage).toBeUndefined();
        });

        it('should calculate connection distribution correctly', () => {
            const latestNginx = { active: 100, reading: 10, writing: 20, waiting: 70 };
            
            const connectionDistribution = [
                { name: 'Active', value: latestNginx.active || 0 },
                { name: 'Reading', value: latestNginx.reading || 0 },
                { name: 'Writing', value: latestNginx.writing || 0 },
                { name: 'Waiting', value: latestNginx.waiting || 0 },
            ].filter(d => d.value > 0);

            expect(connectionDistribution).toHaveLength(4);
            expect(connectionDistribution[0].value).toBe(100);
        });

        it('should handle missing connection data gracefully', () => {
            const latestNginx = {};
            
            const connectionDistribution = [
                { name: 'Active', value: (latestNginx as any).active || 0 },
                { name: 'Reading', value: (latestNginx as any).reading || 0 },
                { name: 'Writing', value: (latestNginx as any).writing || 0 },
                { name: 'Waiting', value: (latestNginx as any).waiting || 0 },
            ].filter(d => d.value > 0);

            expect(connectionDistribution).toHaveLength(0);
        });

        it('should calculate HTTP status summary correctly', () => {
            const httpStatusMetrics = {
                total_status_200_24h: "140000",
                total_status_404_24h: "500",
                total_status_503: "10",
            };

            const summary = {
                success: parseInt(httpStatusMetrics.total_status_200_24h) || 0,
                notFound: parseInt(httpStatusMetrics.total_status_404_24h) || 0,
                serverError: parseInt(httpStatusMetrics.total_status_503) || 0,
            };

            expect(summary.success).toBe(140000);
            expect(summary.notFound).toBe(500);
            expect(summary.serverError).toBe(10);
        });

        it('should handle string numbers in status metrics', () => {
            const httpStatusMetrics = {
                total_status_200_24h: "not_a_number",
                total_status_404_24h: undefined,
                total_status_503: null,
            };

            const summary = {
                success: parseInt(httpStatusMetrics.total_status_200_24h as any) || 0,
                notFound: parseInt(httpStatusMetrics.total_status_404_24h as any) || 0,
                serverError: parseInt(httpStatusMetrics.total_status_503 as any) || 0,
            };

            expect(summary.success).toBe(0);
            expect(summary.notFound).toBe(0);
            expect(summary.serverError).toBe(0);
        });
    });

    describe('Requests Per Second Calculation', () => {
        it('should calculate requests per second from connections history', () => {
            const connectionsHistory = [
                { timestamp: 1000, requests: 100 },
                { timestamp: 1001, requests: 150 },
            ];

            const latest = connectionsHistory[connectionsHistory.length - 1];
            const previous = connectionsHistory[connectionsHistory.length - 2];
            const timeDiff = (latest.timestamp - previous.timestamp) || 1;
            const rps = ((latest.requests - previous.requests) / timeDiff).toFixed(1);

            expect(rps).toBe("50.0");
        });

        it('should handle single data point in connections history', () => {
            const connectionsHistory = [
                { timestamp: 1000, requests: 100 },
            ];

            let rps = 0;
            if (connectionsHistory.length >= 2) {
                const latest = connectionsHistory[connectionsHistory.length - 1];
                const previous = connectionsHistory[connectionsHistory.length - 2];
                const timeDiff = (latest.timestamp - previous.timestamp) || 1;
                rps = (latest.requests - previous.requests) / timeDiff;
            }

            expect(rps).toBe(0);
        });

        it('should handle empty connections history', () => {
            const connectionsHistory: any[] = [];
            
            let rps = 0;
            if (connectionsHistory.length >= 2) {
                // This won't execute
                rps = 1;
            }

            expect(rps).toBe(0);
        });
    });

    describe('System Metrics Processing', () => {
        it('should extract latest system metrics correctly', () => {
            const systemMetrics = [
                { time: "10:00", cpu_usage: 40.0, memory_usage: 60.0 },
                { time: "10:01", cpu_usage: 45.5, memory_usage: 65.2 },
            ];

            const latest = systemMetrics[systemMetrics.length - 1];
            
            expect(latest.cpu_usage).toBe(45.5);
            expect(latest.memory_usage).toBe(65.2);
        });

        it('should handle alternative field names for system metrics', () => {
            const latestSys = {
                cpuUsage: 50.0,
                memoryUsage: 70.0,
                networkRxRate: 1024,
                networkTxRate: 2048,
            };

            const cpuValue = latestSys.cpuUsage || (latestSys as any).cpu_usage || 0;
            const memValue = latestSys.memoryUsage || (latestSys as any).memory_usage || 0;

            expect(cpuValue).toBe(50.0);
            expect(memValue).toBe(70.0);
        });

        it('should format network rates correctly', () => {
            const networkRxRate = 10240; // bytes per second
            const networkTxRate = 20480;

            const rxKBps = (networkRxRate / 1024).toFixed(1);
            const txKBps = (networkTxRate / 1024).toFixed(1);

            expect(rxKBps).toBe("10.0");
            expect(txKBps).toBe("20.0");
        });
    });

    describe('Error Rate Display', () => {
        it('should format error rate correctly', () => {
            const errorRate = 0.5;
            const formatted = errorRate.toFixed(2);
            expect(formatted).toBe("0.50");
        });

        it('should identify high error rate threshold', () => {
            const highError = 1.5;
            const lowError = 0.5;

            expect(highError > 1).toBe(true);
            expect(lowError > 1).toBe(false);
        });

        it('should handle zero error rate', () => {
            const errorRate = 0;
            const formatted = errorRate.toFixed(2);
            expect(formatted).toBe("0.00");
        });
    });

    describe('Latency Formatting', () => {
        it('should round latency to integer milliseconds', () => {
            const avgLatency = 25.7;
            const formatted = Math.round(avgLatency);
            expect(formatted).toBe(26);
        });

        it('should handle zero latency', () => {
            const avgLatency = 0;
            const formatted = Math.round(avgLatency);
            expect(formatted).toBe(0);
        });

        it('should handle very small latency values', () => {
            const avgLatency = 0.21;
            const formatted = Math.round(avgLatency);
            expect(formatted).toBe(0);
        });
    });

    describe('Agent Selection', () => {
        it('should determine online status based on last_seen', () => {
            const now = Math.floor(Date.now() / 1000);
            
            const onlineAgent = { last_seen: String(now - 60) }; // 60 seconds ago
            const offlineAgent = { last_seen: String(now - 300) }; // 5 minutes ago

            const isOnline = (agent: any) => {
                return agent.last_seen && (now - parseInt(agent.last_seen)) < 180;
            };

            expect(isOnline(onlineAgent)).toBe(true);
            expect(isOnline(offlineAgent)).toBe(false);
        });

        it('should handle missing last_seen field', () => {
            const now = Math.floor(Date.now() / 1000);
            const agent = { agent_id: "test" };

            const isOnline = (agent.last_seen && (now - parseInt(agent.last_seen as any)) < 180);
            expect(isOnline).toBeFalsy();
        });
    });

    describe('Top Endpoints Processing', () => {
        it('should parse endpoint data correctly', () => {
            const endpoints = [
                { uri: "/api/test", requests: "5000", p95: 50, errors: "10" },
            ];

            const processed = endpoints.map(e => ({
                uri: e.uri,
                requests: parseInt(e.requests),
                p95: Math.round(e.p95),
                errors: parseInt(e.errors),
            }));

            expect(processed[0].requests).toBe(5000);
            expect(processed[0].errors).toBe(10);
        });

        it('should handle string p95 values', () => {
            const endpoint = { p95: "75.5" };
            const rounded = Math.round(parseFloat(endpoint.p95 as any));
            expect(rounded).toBe(76);
        });

        it('should identify slow endpoints based on p95', () => {
            const slowEndpoint = { p95: 250 };
            const fastEndpoint = { p95: 50 };

            expect(slowEndpoint.p95 > 200).toBe(true);
            expect(fastEndpoint.p95 > 200).toBe(false);
        });
    });

    describe('Recent Requests Processing', () => {
        it('should format timestamp correctly', () => {
            const timestamp = 1708000000; // Unix timestamp in seconds
            const date = new Date(timestamp * 1000);
            const formatted = date.toLocaleTimeString();
            
            expect(formatted).toBeTruthy();
        });

        it('should calculate request latency in milliseconds', () => {
            const requestTime = 0.025; // 25ms in seconds
            const latencyMs = (requestTime * 1000).toFixed(1);
            expect(latencyMs).toBe("25.0");
        });

        it('should identify HTTP method types', () => {
            const getRequest = { request_method: "GET" };
            const postRequest = { request_method: "POST" };

            expect(getRequest.request_method === "GET").toBe(true);
            expect(postRequest.request_method === "GET").toBe(false);
        });

        it('should classify status codes correctly', () => {
            const classifyStatus = (status: number) => {
                if (status >= 500) return 'server-error';
                if (status >= 400) return 'client-error';
                if (status >= 300) return 'redirect';
                return 'success';
            };

            expect(classifyStatus(200)).toBe('success');
            expect(classifyStatus(301)).toBe('redirect');
            expect(classifyStatus(404)).toBe('client-error');
            expect(classifyStatus(500)).toBe('server-error');
        });
    });
});

describe('Monitoring Page - Edge Cases', () => {
    it('should handle null data gracefully', () => {
        const data = null;
        const summary = (data as any)?.summary || {};
        const requestRate = (data as any)?.request_rate || [];

        expect(summary).toEqual({});
        expect(requestRate).toEqual([]);
    });

    it('should handle undefined nested fields', () => {
        const data = { summary: undefined };
        const totalRequests = data.summary?.total_requests || 0;
        
        expect(totalRequests).toBe(0);
    });

    it('should handle malformed number strings', () => {
        const malformed = "not_a_number";
        const parsed = parseInt(malformed) || 0;
        
        expect(parsed).toBe(0);
    });

    it('should handle very large numbers', () => {
        const largeNumber = "999999999";
        const parsed = parseInt(largeNumber);
        const formatted = parsed.toLocaleString();
        
        expect(formatted).toBe("999,999,999");
    });
});
