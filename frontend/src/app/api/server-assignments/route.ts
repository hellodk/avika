import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5050';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const cookieStore = await cookies();
    const token = cookieStore.get('avika_session')?.value;
    
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    if (token) {
        (headers as Record<string, string>)['Cookie'] = `avika_session=${token}`;
    }
    
    return fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });
}

export async function GET() {
    try {
        const response = await fetchWithAuth(`${GATEWAY_URL}/api/server-assignments`);
        
        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch server assignments', assignments: [] },
                { status: response.status }
            );
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching server assignments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch server assignments', assignments: [] },
            { status: 500 }
        );
    }
}
