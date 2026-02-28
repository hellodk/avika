/**
 * Theme-aware chart colors utility
 * 
 * Provides consistent, accessible colors for charts and visualizations
 * that adapt to the current theme while maintaining WCAG AA contrast ratios.
 */

export type ThemeMode = 'dark' | 'light' | 'solarized' | 'nord';

export interface ChartColorPalette {
    // Grid and axes
    grid: string;
    axis: string;
    axisLabel: string;
    
    // Tooltip
    tooltipBg: string;
    tooltipText: string;
    tooltipBorder: string;
    
    // Status colors (WCAG AA compliant)
    success: string;
    warning: string;
    error: string;
    info: string;
    
    // HTTP Status code colors
    status2xx: string;
    status3xx: string;
    status4xx: string;
    status5xx: string;
    
    // Connection state colors
    connectionActive: string;
    connectionReading: string;
    connectionWriting: string;
    connectionWaiting: string;
    
    // System metrics colors
    cpu: string;
    memory: string;
    networkRx: string;
    networkTx: string;
    
    // Latency percentiles
    latencyP50: string;
    latencyP95: string;
    latencyP99: string;
    
    // General chart series colors (for pie charts, etc.)
    series: string[];
}

/**
 * Get chart colors based on theme
 * All colors are chosen to meet WCAG AA contrast requirements
 */
export function getChartColors(theme: ThemeMode = 'dark'): ChartColorPalette {
    const isDark = theme !== 'light';
    
    // Common colors that work in both modes (with slight adjustments)
    const baseColors = {
        // Bright, saturated colors for maximum visibility
        success: isDark ? '#4ade80' : '#16a34a',    // green-400 / green-600
        warning: isDark ? '#fbbf24' : '#d97706',    // amber-400 / amber-600
        error: isDark ? '#f87171' : '#dc2626',      // red-400 / red-600
        info: isDark ? '#60a5fa' : '#2563eb',       // blue-400 / blue-600
    };
    
    if (theme === 'light') {
        return {
            // Grid and axes - subtle but visible
            grid: 'rgba(0, 0, 0, 0.08)',
            axis: '#64748b',          // slate-500
            axisLabel: '#475569',     // slate-600
            
            // Tooltip - high contrast
            tooltipBg: '#ffffff',
            tooltipText: '#0f172a',   // slate-900
            tooltipBorder: '#e2e8f0', // slate-200
            
            // Status colors
            ...baseColors,
            
            // HTTP Status - darker for light mode
            status2xx: '#16a34a',     // green-600
            status3xx: '#2563eb',     // blue-600
            status4xx: '#d97706',     // amber-600
            status5xx: '#dc2626',     // red-600
            
            // Connection states
            connectionActive: '#2563eb',   // blue-600
            connectionReading: '#16a34a',  // green-600
            connectionWriting: '#d97706',  // amber-600
            connectionWaiting: '#7c3aed',  // violet-600
            
            // System metrics
            cpu: '#6366f1',           // indigo-500
            memory: '#d97706',        // amber-600
            networkRx: '#16a34a',     // green-600
            networkTx: '#2563eb',     // blue-600
            
            // Latency
            latencyP50: '#10b981',    // emerald-500
            latencyP95: '#f59e0b',    // amber-500
            latencyP99: '#ef4444',    // red-500
            
            // Series colors for pie charts etc.
            series: [
                '#2563eb',  // blue-600
                '#16a34a',  // green-600
                '#d97706',  // amber-600
                '#7c3aed',  // violet-600
                '#db2777',  // pink-600
                '#0891b2',  // cyan-600
            ],
        };
    }
    
    if (theme === 'solarized') {
        return {
            // Solarized-specific palette
            grid: 'rgba(131, 148, 150, 0.2)',
            axis: '#93a1a1',          // Base1
            axisLabel: '#eee8d5',     // Base2 - brighter for contrast
            
            tooltipBg: '#073642',     // Base02
            tooltipText: '#fdf6e3',   // Base3 - maximum contrast
            tooltipBorder: '#586e75', // Base01
            
            success: '#859900',       // Solarized green
            warning: '#cb4b16',       // Solarized orange (more visible than yellow)
            error: '#dc322f',         // Solarized red
            info: '#268bd2',          // Solarized blue
            
            status2xx: '#859900',
            status3xx: '#268bd2',
            status4xx: '#cb4b16',
            status5xx: '#dc322f',
            
            connectionActive: '#268bd2',
            connectionReading: '#859900',
            connectionWriting: '#cb4b16',
            connectionWaiting: '#6c71c4',
            
            cpu: '#6c71c4',           // Solarized violet
            memory: '#cb4b16',
            networkRx: '#859900',
            networkTx: '#268bd2',
            
            latencyP50: '#2aa198',    // Solarized cyan
            latencyP95: '#cb4b16',
            latencyP99: '#dc322f',
            
            series: [
                '#268bd2',
                '#859900',
                '#cb4b16',
                '#6c71c4',
                '#d33682',
                '#2aa198',
            ],
        };
    }
    
    if (theme === 'nord') {
        return {
            // Nord-specific palette
            grid: 'rgba(216, 222, 233, 0.15)',
            axis: '#d8dee9',          // Snow Storm 1
            axisLabel: '#eceff4',     // Snow Storm 2
            
            tooltipBg: '#3b4252',     // Polar Night 1
            tooltipText: '#eceff4',   // Snow Storm 2
            tooltipBorder: '#4c566a', // Polar Night 3
            
            success: '#a3be8c',       // Nord green
            warning: '#ebcb8b',       // Nord yellow
            error: '#bf616a',         // Nord red
            info: '#88c0d0',          // Nord frost
            
            status2xx: '#a3be8c',
            status3xx: '#88c0d0',
            status4xx: '#ebcb8b',
            status5xx: '#bf616a',
            
            connectionActive: '#88c0d0',
            connectionReading: '#a3be8c',
            connectionWriting: '#ebcb8b',
            connectionWaiting: '#b48ead',
            
            cpu: '#b48ead',           // Nord purple
            memory: '#ebcb8b',
            networkRx: '#a3be8c',
            networkTx: '#88c0d0',
            
            latencyP50: '#8fbcbb',    // Nord frost 0
            latencyP95: '#ebcb8b',
            latencyP99: '#bf616a',
            
            series: [
                '#88c0d0',
                '#a3be8c',
                '#ebcb8b',
                '#b48ead',
                '#bf616a',
                '#8fbcbb',
            ],
        };
    }
    
    // Default dark theme - enterprise optimized for visibility
    return {
        // Grid and axes - visible but not distracting
        grid: 'rgba(100, 116, 139, 0.4)',   // slate-500 at 40%
        axis: '#cbd5e1',                     // slate-300
        axisLabel: '#e2e8f0',                // slate-200
        
        // Tooltip - high contrast
        tooltipBg: 'rgb(30, 41, 59)',        // slate-800
        tooltipText: '#f1f5f9',              // slate-100
        tooltipBorder: 'rgb(100, 116, 139)', // slate-500
        
        // Status colors - bright for dark backgrounds
        ...baseColors,
        
        // HTTP Status - bright, distinguishable
        status2xx: '#4ade80',     // green-400
        status3xx: '#60a5fa',     // blue-400
        status4xx: '#fbbf24',     // amber-400
        status5xx: '#f87171',     // red-400
        
        // Connection states
        connectionActive: '#3b82f6',   // blue-500
        connectionReading: '#10b981',  // emerald-500
        connectionWriting: '#f59e0b',  // amber-500
        connectionWaiting: '#8b5cf6',  // violet-500
        
        // System metrics
        cpu: '#818cf8',           // indigo-400
        memory: '#fbbf24',        // amber-400
        networkRx: '#34d399',     // emerald-400
        networkTx: '#60a5fa',     // blue-400
        
        // Latency percentiles
        latencyP50: '#34d399',    // emerald-400
        latencyP95: '#fbbf24',    // amber-400
        latencyP99: '#f87171',    // red-400
        
        // Series colors for pie charts etc. - high contrast
        series: [
            '#3b82f6',  // blue-500
            '#10b981',  // emerald-500
            '#f59e0b',  // amber-500
            '#8b5cf6',  // violet-500
            '#ec4899',  // pink-500
            '#06b6d4',  // cyan-500
        ],
    };
}

/**
 * Hook-friendly color getter for React components
 * Usage: const colors = useChartColors(theme);
 */
export function getChartColorsForTheme(themeName: string): ChartColorPalette {
    const normalizedTheme = themeName?.toLowerCase() || 'dark';
    
    if (normalizedTheme.includes('light')) return getChartColors('light');
    if (normalizedTheme.includes('solarized')) return getChartColors('solarized');
    if (normalizedTheme.includes('nord')) return getChartColors('nord');
    
    return getChartColors('dark');
}

/**
 * Get status color with proper contrast
 */
export function getStatusColor(status: 'success' | 'warning' | 'error' | 'info', theme: ThemeMode = 'dark'): string {
    const colors = getChartColors(theme);
    return colors[status];
}

/**
 * Get HTTP status code color
 */
export function getHttpStatusColor(statusCode: number | string, theme: ThemeMode = 'dark'): string {
    const colors = getChartColors(theme);
    const code = String(statusCode);
    
    if (code.startsWith('2')) return colors.status2xx;
    if (code.startsWith('3')) return colors.status3xx;
    if (code.startsWith('4')) return colors.status4xx;
    if (code.startsWith('5')) return colors.status5xx;
    
    return colors.info; // fallback
}
