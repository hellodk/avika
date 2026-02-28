import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the apiFetch function
vi.mock('@/lib/api', () => ({
    apiFetch: vi.fn()
}));

// Mock sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

import OptimizationPage from '@/app/optimization/page';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

const mockRecommendations = [
    {
        id: 1,
        title: "Increase Worker Connections",
        description: "Current worker_connections is below optimal for your traffic",
        details: "Based on traffic analysis, increasing worker_connections will improve throughput",
        impact: "high",
        category: "Performance",
        confidence: 0.92,
        estimated_improvement: "+15% throughput",
        current_config: "worker_connections 512;",
        suggested_config: "worker_connections 1024;",
        server: "nginx-pod-1"
    },
    {
        id: 2,
        title: "Enable Gzip Compression",
        description: "Gzip is not enabled for text responses",
        details: "Enabling gzip will reduce bandwidth usage",
        impact: "medium",
        category: "Optimization",
        confidence: 0.85,
        estimated_improvement: "-30% bandwidth",
        current_config: "# gzip off",
        suggested_config: "gzip on; gzip_types text/plain application/json;",
        server: "nginx-pod-2"
    }
];

describe('OptimizationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Data Fetching', () => {
        it('should handle API response with recommendations array (direct array)', async () => {
            // Test case for when API returns array directly
            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockRecommendations)
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            expect(screen.getByText('Enable Gzip Compression')).toBeInTheDocument();
        });

        it('should handle API response with recommendations object (wrapped in object)', async () => {
            // Test case for when API returns { recommendations: [...] }
            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ recommendations: mockRecommendations })
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            expect(screen.getByText('Enable Gzip Compression')).toBeInTheDocument();
        });

        it('should handle empty recommendations array', async () => {
            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ recommendations: [] })
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('System Optimized')).toBeInTheDocument();
            });

            expect(screen.getByText(/No anomalies detected/)).toBeInTheDocument();
        });

        it('should handle API error gracefully', async () => {
            (apiFetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'Server error' })
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText(/Failed to fetch: 500/)).toBeInTheDocument();
            });

            expect(toast.error).toHaveBeenCalledWith(
                'Failed to fetch recommendations',
                expect.any(Object)
            );
        });

        it('should handle network error gracefully', async () => {
            (apiFetch as any).mockRejectedValueOnce(new Error('Network error'));

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Network error')).toBeInTheDocument();
            });

            expect(toast.error).toHaveBeenCalled();
        });

        it('should handle null/undefined response', async () => {
            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(null)
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('System Optimized')).toBeInTheDocument();
            });
        });
    });

    describe('UI Elements', () => {
        beforeEach(() => {
            (apiFetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ recommendations: mockRecommendations })
            });
        });

        it('should display page title and subtitle', async () => {
            render(<OptimizationPage />);

            expect(screen.getByText('AI Tuner')).toBeInTheDocument();
            expect(screen.getByText(/AI-powered configuration optimization/)).toBeInTheDocument();
        });

        it('should display refresh button', async () => {
            render(<OptimizationPage />);

            const refreshButton = screen.getByRole('button', { name: /refresh/i });
            expect(refreshButton).toBeInTheDocument();
        });

        it('should show loading skeletons while fetching', async () => {
            (apiFetch as any).mockImplementationOnce(() => 
                new Promise(resolve => setTimeout(() => resolve({
                    ok: true,
                    json: () => Promise.resolve({ recommendations: [] })
                }), 1000))
            );

            render(<OptimizationPage />);

            // Should show skeleton loaders initially
            const skeletons = document.querySelectorAll('.animate-pulse');
            expect(skeletons.length).toBeGreaterThan(0);
        });

        it('should display active recommendations count', async () => {
            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('2 Active')).toBeInTheDocument();
            });
        });

        it('should display recommendation cards with correct data', async () => {
            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            expect(screen.getByText('high impact')).toBeInTheDocument();
            expect(screen.getByText('nginx-pod-1')).toBeInTheDocument();
            expect(screen.getByText('Confidence: 92%')).toBeInTheDocument();
            expect(screen.getByText('+15% throughput')).toBeInTheDocument();
        });
    });

    describe('User Interactions', () => {
        beforeEach(() => {
            (apiFetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ recommendations: mockRecommendations })
            });
        });

        it('should refresh recommendations when refresh button is clicked', async () => {
            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            const refreshButton = screen.getByRole('button', { name: /refresh/i });
            fireEvent.click(refreshButton);

            // apiFetch should be called again (initial + refresh)
            await waitFor(() => {
                expect(apiFetch).toHaveBeenCalledTimes(2);
            });
        });

        it('should open details dialog when View Details is clicked', async () => {
            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            const viewDetailsButtons = screen.getAllByRole('button', { name: /view details/i });
            fireEvent.click(viewDetailsButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Analysis')).toBeInTheDocument();
                expect(screen.getByText('Configuration Change')).toBeInTheDocument();
            });
        });

        it('should open apply confirmation dialog when Apply Recommendation is clicked', async () => {
            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            const applyButtons = screen.getAllByRole('button', { name: /apply recommendation/i });
            fireEvent.click(applyButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Apply Optimization?')).toBeInTheDocument();
                expect(screen.getByText(/Safe mode is enabled/)).toBeInTheDocument();
            });
        });

        it('should apply recommendation successfully', async () => {
            (apiFetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ recommendations: mockRecommendations })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            // Click Apply
            const applyButtons = screen.getAllByRole('button', { name: /apply recommendation/i });
            fireEvent.click(applyButtons[0]);

            // Confirm in dialog
            await waitFor(() => {
                expect(screen.getByText('Apply Optimization?')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /confirm & apply/i });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(toast.success).toHaveBeenCalledWith(
                    'Optimization applied',
                    expect.any(Object)
                );
            });
        });

        it('should handle apply failure gracefully', async () => {
            (apiFetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ recommendations: mockRecommendations })
                })
                .mockResolvedValueOnce({
                    ok: false,
                    json: () => Promise.resolve({ success: false, error: 'Config validation failed' })
                });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('Increase Worker Connections')).toBeInTheDocument();
            });

            const applyButtons = screen.getAllByRole('button', { name: /apply recommendation/i });
            fireEvent.click(applyButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Apply Optimization?')).toBeInTheDocument();
            });

            const confirmButton = screen.getByRole('button', { name: /confirm & apply/i });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith(
                    'Failed to apply optimization',
                    expect.any(Object)
                );
            });
        });
    });

    describe('Field Mapping', () => {
        it('should correctly map snake_case to camelCase fields', async () => {
            const snakeCaseRecommendation = [{
                id: 1,
                title: "Test",
                description: "Test desc",
                details: "Details",
                impact: "high",
                category: "Performance",
                confidence: 0.9,
                estimated_improvement: "+10% improvement",
                current_config: "old config",
                suggested_config: "new config",
                server: "test-server"
            }];

            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ recommendations: snakeCaseRecommendation })
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('+10% improvement')).toBeInTheDocument();
            });
        });

        it('should handle already camelCase fields', async () => {
            const camelCaseRecommendation = [{
                id: 1,
                title: "Test",
                description: "Test desc",
                details: "Details",
                impact: "high",
                category: "Performance",
                confidence: 0.9,
                estimatedImprovement: "+20% improvement",
                currentConfig: "old config",
                suggestedConfig: "new config",
                server: "test-server"
            }];

            (apiFetch as any).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(camelCaseRecommendation)
            });

            render(<OptimizationPage />);

            await waitFor(() => {
                expect(screen.getByText('+20% improvement')).toBeInTheDocument();
            });
        });
    });
});
