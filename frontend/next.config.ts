import type { NextConfig } from "next";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Read version from VERSION file - REQUIRED, no fallbacks
function getAppVersion(): string {
  // Check environment variable first (set during Docker build)
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }
  
  // Try VERSION files
  const versionFile = join(process.cwd(), "..", "VERSION");
  const localVersionFile = join(process.cwd(), "VERSION");
  
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, "utf-8").trim();
  }
  if (existsSync(localVersionFile)) {
    return readFileSync(localVersionFile, "utf-8").trim();
  }
  
  // No fallback - fail explicitly
  console.error("\n========================================");
  console.error("ERROR: VERSION not found!");
  console.error("========================================\n");
  console.error("Please ensure one of the following:");
  console.error("  1. NEXT_PUBLIC_APP_VERSION env var is set");
  console.error("  2. VERSION file exists in project root");
  console.error("  3. VERSION file exists in frontend/ directory\n");
  throw new Error("VERSION is required but not found. See console for details.");
}

const APP_VERSION = getAppVersion();

const nextConfig: NextConfig = {
  output: "standalone",

  // Allow dev requests from 127.0.0.1 / localhost (e.g. when using basePath /avika)
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Expose version to client-side
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  
  // Base path for serving the app under a subpath (e.g., /avika)
  // Set via NEXT_PUBLIC_BASE_PATH environment variable at build time
  // Example: NEXT_PUBLIC_BASE_PATH=/avika npm run build
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  
  // Asset prefix for CDN or custom domain routing
  // Typically same as basePath, but can be different for CDN usage
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || "",
  
  // Trailing slash behavior
  trailingSlash: false,
  
  // === PERFORMANCE OPTIMIZATIONS ===
  
  // Enable React strict mode for better development
  reactStrictMode: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Experimental features for better performance
  experimental: {
    // Optimize package imports (tree-shaking)
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'recharts',
      '@radix-ui/react-select',
      '@radix-ui/react-switch',
      'framer-motion',
    ],
  },
  
  // HTTP headers for caching
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  
  // Rewrites - proxy health/ready endpoints to gateway so K8s probes work,
  // and proxy /updates/* so the agent install command works in dev (in
  // production, HAProxy handles this same path-based routing).
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_HTTP_URL || "http://localhost:5021";
    return {
      // beforeFiles: runs before Next.js checks filesystem/API routes
      beforeFiles: [
        {
          source: '/health',
          destination: `${gatewayUrl}/health`,
          basePath: false,
        },
        {
          source: '/ready',
          destination: `${gatewayUrl}/ready`,
          basePath: false,
        },
        // /avika/updates/* → gateway /updates/* (binaries, deploy script, version.json, systemd unit)
        {
          source: '/updates/:path*',
          destination: `${gatewayUrl}/updates/:path*`,
        },
      ],
      // afterFiles: checked after filesystem routes but before fallback
      afterFiles: [],
      // fallback: only checked when no page or API route matches.
      // This proxies all /api/* that DON'T have a dedicated Next.js route file
      // to the gateway — so /api/users, /api/teams, /api/sso/*, etc. all work
      // without needing individual proxy routes.
      // Existing routes like /api/servers/route.ts still take precedence.
      fallback: [
        {
          source: '/api/:path*',
          destination: `${gatewayUrl}/api/:path*`,
        },
      ],
    };
  },

  // Redirects - redirect root to basePath; legacy routes to new locations
  async redirects() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/avika";
    return [
      {
        source: '/',
        destination: basePath,
        basePath: false,
        permanent: false,
      },
      { source: '/waf', destination: '/settings/waf', permanent: false },
      { source: '/visitors', destination: '/analytics/visitors', permanent: false },
      { source: '/geo', destination: '/analytics/geo', permanent: false },
      { source: '/servers', destination: '/inventory', permanent: false },
      { source: '/settings/integrations', destination: '/settings?tab=integrations', permanent: false },
      { source: '/settings/security', destination: '/settings?tab=security', permanent: false },
    ];
  },
};

export default nextConfig;
