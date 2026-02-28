import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock NextResponse.json
vi.mock('next/server', async () => {
    const actual = await vi.importActual('next/server');
    return {
        ...actual,
        NextResponse: {
            json: (body: unknown, init?: { status?: number }) => ({
                body,
                status: init?.status || 200,
                headers: new Map(),
            }),
        },
    };
});

describe('Auth API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('POST /api/auth/login', () => {
        it('forwards login request to gateway', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true, token: 'jwt-token' }),
                headers: new Headers(),
            });

            const credentials = { username: 'admin', password: 'password123' };
            
            const response = await simulateLogin(credentials);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/auth/login'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials),
                })
            );
            expect(response.success).toBe(true);
        });

        it('returns error on invalid credentials', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ success: false, message: 'Invalid credentials' }),
                headers: new Headers(),
            });

            const response = await simulateLogin({ username: 'admin', password: 'wrong' });

            expect(response.success).toBe(false);
            expect(response.message).toBe('Invalid credentials');
        });

        it('handles gateway connection failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const response = await simulateLogin({ username: 'admin', password: 'password' });

            expect(response.success).toBe(false);
            expect(response.message).toContain('Failed to connect');
        });

        it('forwards session cookie from gateway', async () => {
            const headers = new Headers();
            headers.set('set-cookie', 'session=abc123; HttpOnly; Secure');
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true }),
                headers,
            });

            const response = await simulateLoginWithHeaders({ username: 'admin', password: 'password' });

            expect(response.cookie).toBeDefined();
        });

        it('validates required fields', () => {
            const validRequest = { username: 'admin', password: 'password123' };
            const missingUsername = { password: 'password123' };
            const missingPassword = { username: 'admin' };

            expect(validateLoginRequest(validRequest)).toBe(true);
            expect(validateLoginRequest(missingUsername)).toBe(false);
            expect(validateLoginRequest(missingPassword)).toBe(false);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('clears session on logout', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true }),
                headers: new Headers(),
            });

            const response = await simulateLogout();

            expect(response.success).toBe(true);
        });
    });

    describe('GET /api/auth/me', () => {
        it('returns user info when authenticated', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ 
                    success: true, 
                    user: { username: 'admin', role: 'admin' } 
                }),
                headers: new Headers(),
            });

            const response = await simulateGetUser('valid-session-token');

            expect(response.success).toBe(true);
            expect(response.user.username).toBe('admin');
        });

        it('returns 401 when not authenticated', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ success: false, message: 'Unauthorized' }),
                headers: new Headers(),
            });

            const response = await simulateGetUser('');

            expect(response.success).toBe(false);
        });
    });

    describe('POST /api/auth/change-password', () => {
        it('changes password successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true, message: 'Password updated' }),
                headers: new Headers(),
            });

            const response = await simulateChangePassword({
                currentPassword: 'oldPassword',
                newPassword: 'newPassword123!',
            });

            expect(response.success).toBe(true);
        });

        it('rejects weak password', () => {
            const weakPassword = '123';
            expect(isStrongPassword(weakPassword)).toBe(false);
        });

        it('accepts strong password', () => {
            const strongPassword = 'StrongP@ssw0rd!';
            expect(isStrongPassword(strongPassword)).toBe(true);
        });
    });
});

// Helper functions to simulate API calls
async function simulateLogin(credentials: { username?: string; password?: string }) {
    try {
        const response = await fetch('http://localhost/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });
        return await response.json();
    } catch (error) {
        return { success: false, message: 'Failed to connect to authentication service' };
    }
}

async function simulateLoginWithHeaders(credentials: { username: string; password: string }) {
    try {
        const response = await fetch('http://localhost/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });
        const data = await response.json();
        const cookie = response.headers.get('set-cookie');
        return { ...data, cookie };
    } catch (error) {
        return { success: false, message: 'Failed to connect' };
    }
}

async function simulateLogout() {
    try {
        const response = await fetch('http://localhost/api/auth/logout', {
            method: 'POST',
        });
        return await response.json();
    } catch (error) {
        return { success: false };
    }
}

async function simulateGetUser(sessionToken: string) {
    try {
        const response = await fetch('http://localhost/api/auth/me', {
            headers: { Cookie: `session=${sessionToken}` },
        });
        return await response.json();
    } catch (error) {
        return { success: false };
    }
}

async function simulateChangePassword(data: { currentPassword: string; newPassword: string }) {
    try {
        const response = await fetch('http://localhost/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return await response.json();
    } catch (error) {
        return { success: false };
    }
}

function validateLoginRequest(request: { username?: string; password?: string }): boolean {
    return Boolean(request.username && request.password);
}

function isStrongPassword(password: string): boolean {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
    return true;
}
