import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that don't require authentication
// Note: When basePath is configured, Next.js middleware receives pathname WITHOUT the basePath
const publicPaths = ["/login", "/change-password", "/api/auth/login", "/api/auth/logout", "/api/auth/change-password", "/api/health"];

export function middleware(request: NextRequest) {
  // pathname is already stripped of basePath by Next.js
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    return NextResponse.next();
  }

  // Allow API routes except /api/auth/me (which needs auth check)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/me")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("avika_session");

  if (!sessionCookie?.value) {
    // Redirect to login page
    // Note: Next.js automatically prepends basePath to redirects
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname || "/");
    return NextResponse.redirect(loginUrl);
  }

  // Session exists, allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, json, etc.)
     */
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|ico)$).+)",
  ],
};
