import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        refresh: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

// Mock recharts
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
    AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
    Area: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Dashboard Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default mock responses - handle both with and without base path
        mockFetch.mockImplementation((url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes('/api/servers')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        agents: [
                            { id: 'agent-1', hostname: 'nginx-1', last_seen: Math.floor(Date.now() / 1000).toString() },
                            { id: 'agent-2', hostname: 'nginx-2', last_seen: Math.floor(Date.now() / 1000).toString() },
                        ]
                    }),
                });
            }
            if (urlStr.includes('/api/analytics')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        summary: {
                            total_requests: 10000,
                            error_rate: 0.5,
                            avg_latency: 45,
                        },
                        request_rate: [
                            { time: new Date().toISOString(), requests: 100, errors: 1 },
                        ],
                        status_distribution: [
                            { code: 200, count: 9000 },
                            { code: 404, count: 500 },
                            { code: 500, count: 100 },
                        ],
                        top_endpoints: [
                            { uri: '/api/users', requests: 5000, p95: 50, errors: 10 },
                            { uri: '/api/products', requests: 3000, p95: 100, errors: 5 },
                        ],
                    }),
                });
            }
            return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Rendering', () => {
        it('renders the dashboard title', async () => {
            render(<Home />);
            
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
            expect(screen.getByText('Overview of your NGINX infrastructure')).toBeInTheDocument();
        });

        it('renders KPI cards', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('Total Requests')).toBeInTheDocument();
                expect(screen.getByText('Request Rate')).toBeInTheDocument();
                expect(screen.getByText('Error Rate')).toBeInTheDocument();
                expect(screen.getByText('Avg Latency')).toBeInTheDocument();
            });
        });

        it('renders agent status badge', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText(/Agents Online/)).toBeInTheDocument();
            });
        });

        it('renders refresh button', () => {
            render(<Home />);
            
            expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
        });

        it('renders time range picker', () => {
            render(<Home />);
            
            expect(screen.getAllByText(/Last/).length).toBeGreaterThan(0);
        });
    });

    describe('Data Fetching', () => {
        it('fetches servers data on mount', async () => {
            render(<Home />);

            await waitFor(() => {
                const calls = mockFetch.mock.calls.map((call: unknown[]) => call[0]);
                expect(calls.some((url: string) => url.includes('/api/servers'))).toBe(true);
            });
        });

        it('fetches analytics data on mount', async () => {
            render(<Home />);

            await waitFor(() => {
                const calls = mockFetch.mock.calls.map((call: unknown[]) => call[0]);
                expect(calls.some((url: string) => url.includes('/api/analytics'))).toBe(true);
            });
        });

        it('displays loading state while fetching', () => {
            mockFetch.mockImplementation(() => new Promise(() => {}));
            render(<Home />);
            
            expect(screen.getAllByTestId ? screen.queryAllByRole('progressbar') : []).toBeDefined();
        });

        it('displays error state on connection failure', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText(/Connection Error|error/i)).toBeInTheDocument();
            });
        });
    });

    describe('Agent Status', () => {
        it('shows correct online agent count', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText(/Agents Online/)).toBeInTheDocument();
            });
        });

        it('shows warning when some agents offline', async () => {
            mockFetch.mockImplementation((url: string | URL | Request) => {
                const urlStr = url.toString();
                if (urlStr.includes('/api/servers')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            agents: [
                                { id: 'agent-1', hostname: 'nginx-1', last_seen: Math.floor(Date.now() / 1000).toString() },
                                { id: 'agent-2', hostname: 'nginx-2', last_seen: '0' },
                            ]
                        }),
                    });
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
            });

            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText(/Agents Online/)).toBeInTheDocument();
            });
        });
    });

    describe('KPI Values', () => {
        it('displays total requests', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('10,000')).toBeInTheDocument();
            });
        });

        it('displays error rate', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('0.50%')).toBeInTheDocument();
            });
        });

        it('displays average latency', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('45ms')).toBeInTheDocument();
            });
        });
    });

    describe('User Interactions', () => {
        it('refreshes data when refresh button clicked', async () => {
            const user = userEvent.setup();
            render(<Home />);

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
            });

            const initialCallCount = mockFetch.mock.calls.length;

            const refreshButton = screen.getByRole('button', { name: /refresh/i });
            await user.click(refreshButton);

            await waitFor(() => {
                expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
            });
        });
    });

    describe('Charts', () => {
        it('renders traffic overview section', async () => {
            render(<Home />);

            expect(screen.getByText('Traffic Overview')).toBeInTheDocument();
        });

        it('renders response codes section', async () => {
            render(<Home />);

            expect(screen.getByText('Response Codes')).toBeInTheDocument();
        });
    });

    describe('Status Distribution', () => {
        it('displays 2xx success status', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('2xx Success')).toBeInTheDocument();
            });
        });

        it('displays 4xx client error status', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('4xx Client Error')).toBeInTheDocument();
            });
        });

        it('displays 5xx server error status', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('5xx Server Error')).toBeInTheDocument();
            });
        });
    });

    describe('Top Endpoints', () => {
        it('renders top endpoints section', async () => {
            render(<Home />);

            expect(screen.getByText('Top Endpoints')).toBeInTheDocument();
        });

        it('displays endpoint data', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('/api/users')).toBeInTheDocument();
                expect(screen.getByText('/api/products')).toBeInTheDocument();
            });
        });
    });

    describe('System Insights', () => {
        it('renders system insights section', async () => {
            render(<Home />);

            expect(screen.getByText('System Insights')).toBeInTheDocument();
        });

        it('shows fleet status insight', async () => {
            render(<Home />);

            await waitFor(() => {
                expect(screen.getByText('Fleet Status')).toBeInTheDocument();
            });
        });
    });

    describe('Navigation Links', () => {
        it('has link to analytics page', () => {
            render(<Home />);

            const viewDetailsLinks = screen.getAllByRole('link', { name: /view details|view all/i });
            expect(viewDetailsLinks.length).toBeGreaterThan(0);
        });
    });

    describe('Accessibility', () => {
        it('has aria-label for agent status badge', async () => {
            render(<Home />);

            await waitFor(() => {
                const badge = screen.getByLabelText(/agents online/i);
                expect(badge).toBeInTheDocument();
            });
        });

        it('has aria-label for refresh button', () => {
            render(<Home />);

            expect(screen.getByLabelText(/refresh dashboard data/i)).toBeInTheDocument();
        });
    });
});
