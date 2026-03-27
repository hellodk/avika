import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardBuilderButton, useDashboardWidgets } from '@/components/DashboardBuilder';
import { renderHook, act as hookAct } from '@testing-library/react';

const PREFS_KEY = 'avika_dashboard_widgets';

describe('DashboardBuilder', () => {
    beforeEach(() => {
        localStorage.removeItem(PREFS_KEY);
        vi.clearAllMocks();
    });

    afterEach(() => {
        localStorage.removeItem(PREFS_KEY);
    });

    describe('useDashboardWidgets hook', () => {
        it('returns default widgets on first load', () => {
            const { result } = renderHook(() => useDashboardWidgets());
            
            expect(result.current.widgets.length).toBeGreaterThan(0);
            expect(result.current.pinnedWidgets.length).toBeGreaterThan(0);
        });

        it('default pinned widgets include total_requests, request_rate, error_rate, avg_latency', () => {
            const { result } = renderHook(() => useDashboardWidgets());
            
            const pinnedIds = result.current.pinnedWidgets.map(w => w.id);
            expect(pinnedIds).toContain('total_requests');
            expect(pinnedIds).toContain('request_rate');
            expect(pinnedIds).toContain('error_rate');
            expect(pinnedIds).toContain('avg_latency');
        });

        it('togglePin flips the pinned state of a widget', async () => {
            const { result } = renderHook(() => useDashboardWidgets());

            const agentWidget = result.current.widgets.find(w => w.id === 'agent_count');
            const initialPinned = agentWidget?.pinned ?? false;

            hookAct(() => {
                result.current.togglePin('agent_count');
            });

            const updated = result.current.widgets.find(w => w.id === 'agent_count');
            expect(updated?.pinned).toBe(!initialPinned);
        });

        it('persists pinned state to localStorage', () => {
            const { result } = renderHook(() => useDashboardWidgets());

            hookAct(() => {
                result.current.togglePin('agent_count');
            });

            const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '[]');
            const savedAgent = saved.find((s: any) => s.id === 'agent_count');
            expect(savedAgent).toBeDefined();
        });

        it('loads pinned state from localStorage', () => {
            // Pre-set localStorage to have agent_count pinned
            const prefs = [
                { id: 'total_requests', pinned: true },
                { id: 'agent_count', pinned: true },
            ];
            localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

            const { result } = renderHook(() => useDashboardWidgets());
            
            const agentWidget = result.current.widgets.find(w => w.id === 'agent_count');
            expect(agentWidget?.pinned).toBe(true);
        });

        it('handles corrupt localStorage gracefully', () => {
            localStorage.setItem(PREFS_KEY, '{{invalid json}}');
            
            expect(() => {
                renderHook(() => useDashboardWidgets());
            }).not.toThrow();
        });
    });

    describe('DashboardBuilderButton', () => {
        const defaultWidgets = [
            { id: 'total_requests', label: 'Total Requests', icon: () => null, description: 'desc', pinned: true },
            { id: 'agent_count', label: 'Active Agents', icon: () => null, description: 'desc', pinned: false },
        ];

        it('renders the Customize button', () => {
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
        });

        it('shows (N pinned) count in button', () => {
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            expect(screen.getByText(/1 pinned/i)).toBeInTheDocument();
        });

        it('opens dialog when button clicked', async () => {
            const user = userEvent.setup();
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /customize/i }));

            await waitFor(() => {
                expect(screen.getByText('Customize Dashboard')).toBeInTheDocument();
            });
        });

        it('shows all widget names in dialog', async () => {
            const user = userEvent.setup();
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /customize/i }));

            await waitFor(() => {
                expect(screen.getByText('Total Requests')).toBeInTheDocument();
                expect(screen.getByText('Active Agents')).toBeInTheDocument();
            });
        });

        it('calls onTogglePin when a widget row is clicked', async () => {
            const onToggle = vi.fn();
            const user = userEvent.setup();
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={onToggle}
                />
            );

            await user.click(screen.getByRole('button', { name: /customize/i }));
            await waitFor(() => screen.getByText('Active Agents'));

            // Click on the Active Agents row
            await user.click(screen.getByText('Active Agents'));

            expect(onToggle).toHaveBeenCalledWith('agent_count');
        });

        it('shows Pinned badge for pinned widgets', async () => {
            const user = userEvent.setup();
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /customize/i }));

            await waitFor(() => {
                expect(screen.getByText('Pinned')).toBeInTheDocument();
                expect(screen.getByText('Hidden')).toBeInTheDocument();
            });
        });

        it('closes dialog when Save Layout button clicked', async () => {
            const user = userEvent.setup();
            render(
                <DashboardBuilderButton
                    widgets={defaultWidgets}
                    onTogglePin={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /customize/i }));
            await waitFor(() => screen.getByText('Save Layout'));
            await user.click(screen.getByText('Save Layout'));

            await waitFor(() => {
                expect(screen.queryByText('Customize Dashboard')).not.toBeInTheDocument();
            });
        });
    });
});
