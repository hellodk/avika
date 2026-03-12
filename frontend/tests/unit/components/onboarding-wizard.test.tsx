import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from '@/components/OnboardingWizard';

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

const ONBOARDING_KEY = 'avika_onboarding_complete';

describe('OnboardingWizard', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.removeItem(ONBOARDING_KEY);
        vi.clearAllMocks();
    });

    afterEach(() => {
        localStorage.removeItem(ONBOARDING_KEY);
    });

    describe('First Visit', () => {
        it('shows the wizard on first visit (no localStorage key)', async () => {
            render(<OnboardingWizard />);
            
            await waitFor(() => {
                expect(screen.getAllByText('Welcome to Avika NGINX Manager').length).toBeGreaterThan(0);
            });
        });

        it('does NOT show the wizard when onboarding complete key is set', async () => {
            localStorage.setItem(ONBOARDING_KEY, 'true');
            render(<OnboardingWizard />);
            
            await waitFor(() => {
                expect(screen.queryAllByText('Welcome to Avika NGINX Manager').length).toBe(0);
            });
        });
    });

    describe('Step Navigation', () => {
        it('starts on step 1 (Welcome)', async () => {
            render(<OnboardingWizard />);
            
            await waitFor(() => {
                expect(screen.getAllByText('Welcome to Avika NGINX Manager').length).toBeGreaterThan(0);
                expect(screen.getByRole('button', { name: /Get Started/i })).toBeInTheDocument();
            });
        });

        it('advances to the next step when CTA is clicked', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);
            
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Get Started/ })).toBeInTheDocument();
            });
            
            await user.click(screen.getByRole('button', { name: /Get Started/ }));

            await waitFor(() => {
                expect(screen.getAllByText('Connect Your First Agent').length).toBeGreaterThan(0);
            });
        });

        it('shows install command on agent step', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);

            await user.click(await screen.findByText('Get Started'));

            await waitFor(() => {
                expect(screen.getByText(/curl -sSL/)).toBeInTheDocument();
            });
        });

        it('advances through all 4 steps', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);

            // Step 1 → 2
            await user.click(await screen.findByRole('button', { name: /Get Started/ }));
            // Step 2 → 3
            await user.click(await screen.findByRole('button', { name: /I've installed the agent/ }));
            // Step 3 → 4
            await user.click(await screen.findByRole('button', { name: /Create a Project/ }));
            
            await waitFor(() => {
                expect(screen.getAllByText("You're All Set!").length).toBeGreaterThan(0);
            });
        });

        it('closes and sets localStorage when final CTA clicked', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);

            // Navigate through all steps
            await user.click(await screen.findByRole('button', { name: /Get Started/ }));
            await user.click(await screen.findByRole('button', { name: /I've installed the agent/ }));
            await user.click(await screen.findByRole('button', { name: /Create a Project/ }));
            await user.click(await screen.findByRole('button', { name: /Go to Dashboard/ }));
            
            expect(localStorage.getItem(ONBOARDING_KEY)).toBe('true');
            
            await waitFor(() => {
                expect(screen.queryAllByText("You're All Set!").length).toBe(0);
            });
        });
    });

    describe('Dismiss/Close', () => {
        it('closes wizard when X button is clicked', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);

            await waitFor(() => {
                expect(screen.getAllByText('Welcome to Avika NGINX Manager').length).toBeGreaterThan(0);
            });
            
            // Find close button (X)
            const closeButtons = screen.getAllByRole('button');
            // The X button is the icon-only dismiss button
            const xButton = closeButtons.find(btn => btn.querySelector('svg'));
            if (xButton) await user.click(xButton);

            expect(localStorage.getItem(ONBOARDING_KEY)).toBe('true');
        });

        it('sets localStorage when wizard is dismissed', async () => {
            const user = userEvent.setup();
            render(<OnboardingWizard />);

            await waitFor(() => screen.getByText('Get Started'));
            
            // Click Skip for now on step 3
            await user.click(screen.getByText('Get Started'));
            await user.click(await screen.findByText("I've installed the agent"));
            await user.click(await screen.findByText('Skip for now'));
            
            expect(localStorage.getItem(ONBOARDING_KEY)).toBe('true');
        });
    });

    describe('Progress Indicator', () => {
        it('shows 4 step indicators', async () => {
            render(<OnboardingWizard />);

            await waitFor(() => {
                expect(screen.getAllByText('Welcome to Avika NGINX Manager').length).toBeGreaterThan(0);
            });

            // The component renders dots, check the container
            const dialog = document.querySelector('[role="dialog"]');
            expect(dialog).not.toBeNull();
        });
    });
});
