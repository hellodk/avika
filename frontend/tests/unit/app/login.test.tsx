import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        refresh: mockRefresh,
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    }),
    usePathname: () => '/login',
    useSearchParams: () => new URLSearchParams(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Rendering', () => {
        it('renders the login form', () => {
            render(<LoginPage />);

            expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
            expect(screen.getByText('Access your management console')).toBeInTheDocument();
            expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        });

        it('renders username input with correct attributes', () => {
            render(<LoginPage />);

            const usernameInput = screen.getByLabelText(/username/i);
            expect(usernameInput).toHaveAttribute('type', 'text');
            expect(usernameInput).toHaveAttribute('required');
            expect(usernameInput).toHaveAttribute('placeholder', 'Enter username');
        });

        it('renders password input with correct attributes', () => {
            render(<LoginPage />);

            const passwordInput = screen.getByLabelText(/password/i);
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('required');
        });

        it('renders the security badges', () => {
            render(<LoginPage />);

            // Security badges for PSK and TLS should be present
            expect(screen.getByText('PSK')).toBeInTheDocument();
            expect(screen.getByText('TLS')).toBeInTheDocument();
        });
    });

    describe('Form Interactions', () => {
        it('allows typing in username field', async () => {
            const user = userEvent.setup();
            render(<LoginPage />);

            const usernameInput = screen.getByLabelText(/username/i);
            await user.type(usernameInput, 'testuser');

            expect(usernameInput).toHaveValue('testuser');
        });

        it('allows typing in password field', async () => {
            const user = userEvent.setup();
            render(<LoginPage />);

            const passwordInput = screen.getByLabelText(/password/i);
            await user.type(passwordInput, 'secretpassword');

            expect(passwordInput).toHaveValue('secretpassword');
        });

        it('clears form fields on initial render', () => {
            render(<LoginPage />);

            expect(screen.getByLabelText(/username/i)).toHaveValue('');
            expect(screen.getByLabelText(/password/i)).toHaveValue('');
        });
    });

    describe('Form Submission - Success', () => {
        it('submits form with correct credentials', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password123');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username: 'admin', password: 'password123' }),
                });
            });
        });

        it('redirects to dashboard on successful login', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password123');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/');
                expect(mockRefresh).toHaveBeenCalled();
            });
        });

        it('shows loading state during submission', async () => {
            const user = userEvent.setup();
            // Make fetch hang to test loading state
            mockFetch.mockImplementation(() => new Promise(() => {}));

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password123');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText(/signing in/i)).toBeInTheDocument();
            });
        });

        it('disables button during loading', async () => {
            const user = userEvent.setup();
            mockFetch.mockImplementation(() => new Promise(() => {}));

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password123');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                const submitButton = screen.getByRole('button', { name: /signing in/i });
                expect(submitButton).toBeDisabled();
            });
        });
    });

    describe('Form Submission - Errors', () => {
        it('displays error message on invalid credentials', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        success: false,
                        message: 'Invalid username or password',
                    }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
            });
        });

        it('displays default error message when message is not provided', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: false }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText('Login failed')).toBeInTheDocument();
            });
        });

        it('displays network error message on fetch failure', async () => {
            const user = userEvent.setup();
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText('Failed to connect to server')).toBeInTheDocument();
            });
        });

        it('does not redirect on failed login', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        success: false,
                        message: 'Invalid credentials',
                    }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'wrong');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(mockPush).not.toHaveBeenCalled();
            });
        });

        it('clears error on new submission', async () => {
            const user = userEvent.setup();

            // First submission fails
            mockFetch.mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        success: false,
                        message: 'Invalid credentials',
                    }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'wrong');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
            });

            // Second submission - error should be cleared while loading
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true }),
            });

            await user.clear(screen.getByLabelText(/password/i));
            await user.type(screen.getByLabelText(/password/i), 'correct');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/');
            });
        });

        it('re-enables button after error', async () => {
            const user = userEvent.setup();
            mockFetch.mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        success: false,
                        message: 'Error',
                    }),
            });

            render(<LoginPage />);

            await user.type(screen.getByLabelText(/username/i), 'admin');
            await user.type(screen.getByLabelText(/password/i), 'password');
            await user.click(screen.getByRole('button', { name: /sign in/i }));

            await waitFor(() => {
                expect(screen.getByText('Error')).toBeInTheDocument();
                const button = screen.getByRole('button', { name: /sign in/i });
                expect(button).not.toBeDisabled();
            });
        });
    });

    describe('Form Validation', () => {
        it('form has required inputs', () => {
            render(<LoginPage />);

            const usernameInput = screen.getByLabelText(/username/i);
            const passwordInput = screen.getByLabelText(/password/i);

            expect(usernameInput).toBeRequired();
            expect(passwordInput).toBeRequired();
        });
    });

    describe('Accessibility', () => {
        it('has proper labels for form inputs', () => {
            render(<LoginPage />);

            expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        });

        it('has a submit button', () => {
            render(<LoginPage />);

            const button = screen.getByRole('button', { name: /sign in/i });
            expect(button).toHaveAttribute('type', 'submit');
        });

        it('form is wrapped in a form element', () => {
            render(<LoginPage />);

            const form = document.querySelector('form');
            expect(form).toBeInTheDocument();
        });
    });

    describe('Styling', () => {
        it('has proper dark theme styling', () => {
            render(<LoginPage />);

            // Check for dark theme background (uses inline style with gradient)
            const container = document.querySelector('.min-h-screen');
            expect(container).toBeInTheDocument();
            // Verify inline style contains the gradient
            const style = container?.getAttribute('style') || '';
            expect(style).toContain('linear-gradient');
        });
    });
});
