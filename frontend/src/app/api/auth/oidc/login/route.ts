import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { getGatewayUrl } from '@/lib/gateway-url';

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const redirect = searchParams.get('redirect') || '/';

        // Redirect to gateway's OIDC login endpoint
        const gatewayUrl = `${GATEWAY_URL}/api/auth/oidc/login?redirect=${encodeURIComponent(redirect)}`;

        return NextResponse.redirect(gatewayUrl);
    } catch (error) {
        console.error('Error initiating OIDC login:', error);
        return NextResponse.redirect(new URL('/login?error=sso_failed', request.url));
    }
}
