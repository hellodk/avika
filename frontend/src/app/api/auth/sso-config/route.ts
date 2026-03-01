import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || process.env.GATEWAY_URL || 'http://localhost:5050';

export async function GET() {
    try {
        const response = await fetch(`${GATEWAY_URL}/api/auth/sso-config`, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            return NextResponse.json({ oidc_enabled: false });
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching SSO config:', error);
        return NextResponse.json({ oidc_enabled: false });
    }
}
