import type { NextRequest } from "next/server";

/**
 * Cookie header to forward to the gateway from a Next.js Route Handler.
 * Prefer avika_session from parsed cookies; fall back to the raw Cookie header (parity with /api/servers).
 * Omit the header entirely when there is nothing to send — do not send Cookie: "".
 */
export function gatewayProxyCookieHeaders(request: NextRequest): HeadersInit {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const cookieHeader =
        sessionCookie != null
            ? `avika_session=${sessionCookie}`
            : request.headers.get("cookie") ?? undefined;
    return cookieHeader ? { Cookie: cookieHeader } : {};
}
