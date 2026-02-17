# Frontend Optimization Guide

## Current State Analysis

### Bundle Sizes
- **Total .next folder**: 343 MB
- **Largest JS chunks**: ~376 KB each (4 chunks)
- **node_modules**: ~600 MB total

### Heavy Dependencies
| Package | Size | Status |
|---------|------|--------|
| lucide-react | 45 MB | Properly tree-shaken |
| date-fns | 39 MB | Can be optimized |
| reactflow | ~8 MB | **UNUSED - Remove** |
| recharts | ~15 MB | Needs dynamic import |
| framer-motion | ~5 MB | Used but heavy |

---

## Immediate Optimizations (Quick Wins)

### 1. Remove Unused Dependencies

```bash
npm uninstall reactflow
```

**Impact**: Saves ~8 MB from node_modules and reduces bundle size.

### 2. Update next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: false,
  
  // === NEW OPTIMIZATIONS ===
  
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
  
  // Webpack optimizations
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Separate vendor chunks
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          // Separate chart libraries
          charts: {
            test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
            name: 'charts',
            chunks: 'all',
            priority: 10,
          },
        },
      };
    }
    return config;
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
};

export default nextConfig;
```

### 3. Dynamic Imports for Heavy Components

**Create: `src/components/charts/DynamicCharts.tsx`**

```typescript
import dynamic from 'next/dynamic';

// Lazy load Recharts components
export const DynamicAreaChart = dynamic(
  () => import('recharts').then((mod) => mod.AreaChart),
  { ssr: false, loading: () => <div className="animate-pulse bg-gray-700 h-64 rounded" /> }
);

export const DynamicLineChart = dynamic(
  () => import('recharts').then((mod) => mod.LineChart),
  { ssr: false, loading: () => <div className="animate-pulse bg-gray-700 h-64 rounded" /> }
);

export const DynamicBarChart = dynamic(
  () => import('recharts').then((mod) => mod.BarChart),
  { ssr: false, loading: () => <div className="animate-pulse bg-gray-700 h-64 rounded" /> }
);

export const DynamicPieChart = dynamic(
  () => import('recharts').then((mod) => mod.PieChart),
  { ssr: false, loading: () => <div className="animate-pulse bg-gray-700 h-64 rounded" /> }
);

// Re-export other components that are small
export {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  Line,
  Bar,
  Pie,
  Cell,
} from 'recharts';
```

### 4. Lazy Load Heavy Pages

**Update analytics page with dynamic imports:**

```typescript
// src/app/analytics/page.tsx
import dynamic from 'next/dynamic';

const SystemDashboard = dynamic(
  () => import('@/components/analytics/dashboards/SystemDashboard').then(m => m.SystemDashboard),
  { ssr: false }
);

const TrafficDashboard = dynamic(
  () => import('@/components/analytics/dashboards/TrafficDashboard').then(m => m.TrafficDashboard),
  { ssr: false }
);

const NginxCoreDashboard = dynamic(
  () => import('@/components/analytics/dashboards/NginxCoreDashboard').then(m => m.NginxCoreDashboard),
  { ssr: false }
);
```

---

## Medium-Term Optimizations

### 5. Replace date-fns with Lighter Alternative

**Option A: Use native Intl API (Zero dependency)**

```typescript
// src/lib/date-utils.ts
export function formatDate(date: Date, format: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = date.getTime() - Date.now();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  
  if (Math.abs(days) < 1) {
    const hours = Math.round(diff / (1000 * 60 * 60));
    return rtf.format(hours, 'hour');
  }
  return rtf.format(days, 'day');
}
```

**Option B: Use dayjs (2KB vs date-fns 39MB)**

```bash
npm uninstall date-fns
npm install dayjs
```

### 6. Optimize Lucide Icons Import

Create a centralized icon export file:

```typescript
// src/components/icons/index.tsx
// Only export icons that are actually used
export {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  Download,
  Edit2,
  FileCode,
  FileText,
  Filter,
  Globe,
  HardDrive,
  Info,
  Loader2,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  ShieldOff,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
```

### 7. Add Compression

Install and configure compression:

```bash
npm install compression
```

Or use Next.js built-in compression in production.

---

## Long-Term Optimizations

### 8. Consider Alternative Chart Library

**Lightweight alternatives to Recharts:**

| Library | Size | Features |
|---------|------|----------|
| **Chart.js** | ~60KB | Good balance |
| **Lightweight Charts** | ~40KB | Financial charts |
| **uPlot** | ~30KB | High performance |
| **visx** | Modular | Only import what you need |

### 9. Implement Route-Based Code Splitting

Next.js does this automatically, but ensure heavy components are:
- Dynamically imported
- Not included in the initial bundle
- Loaded on demand

### 10. Add Service Worker for Caching

```typescript
// next.config.ts - add PWA support
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});
```

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | Remove reactflow | 5 min | Medium |
| 🔴 High | Update next.config.ts | 15 min | High |
| 🔴 High | Add optimizePackageImports | 5 min | High |
| 🟡 Medium | Dynamic import charts | 30 min | Medium |
| 🟡 Medium | Replace date-fns | 1-2 hrs | Medium |
| 🟡 Medium | Lazy load heavy pages | 30 min | Medium |
| 🟢 Low | Centralize icons | 1 hr | Low |
| 🟢 Low | Alternative chart lib | 4+ hrs | Medium |

---

## Expected Improvements

After implementing high-priority optimizations:

| Metric | Before | After (Est.) |
|--------|--------|--------------|
| Initial JS | ~500 KB | ~300 KB |
| node_modules | 600 MB | ~550 MB |
| Build time | 13s | ~10s |
| LCP | TBD | -20-30% |
| TTI | TBD | -25-35% |

---

## Monitoring

### Install Bundle Analyzer

```bash
npm install @next/bundle-analyzer
```

**Update next.config.ts:**

```typescript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
```

**Run analysis:**

```bash
ANALYZE=true npm run build
```

### Add Web Vitals Monitoring

```typescript
// src/app/layout.tsx
import { useReportWebVitals } from 'next/web-vitals';

export function reportWebVitals(metric) {
  console.log(metric);
  // Send to analytics
}
```
