"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface LiveMetricsContextType {
    data: any;
    isConnected: boolean;
    isLive: boolean;
    setIsLive: (live: boolean) => void;
    error: string | null;
}

const LiveMetricsContext = createContext<LiveMetricsContextType | undefined>(undefined);

export function LiveMetricsProvider({
    children,
    agentId = 'all',
    window = '1h'
}: {
    children: ReactNode,
    agentId?: string,
    window?: string
}) {
    const [data, setData] = useState<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLive) {
            setIsConnected(false);
            return;
        }

        console.log(`Starting live stream for agent: ${agentId}`);
        const eventSource = new EventSource(`/api/analytics/stream?agent_id=${agentId}&window=${window}`);

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
            console.log('Live stream connected');
        };

        eventSource.onmessage = (event) => {
            try {
                const parsedData = JSON.parse(event.data);
                setData(parsedData);
            } catch (err) {
                console.error('Failed to parse live data:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('Live stream error:', err);
            setError('Connection lost. Retrying...');
            setIsConnected(false);
        };

        return () => {
            eventSource.close();
            setIsConnected(false);
        };
    }, [isLive, agentId, window]);

    return (
        <LiveMetricsContext.Provider value={{ data, isConnected, isLive, setIsLive, error }}>
            {children}
        </LiveMetricsContext.Provider>
    );
}

export const useLiveMetrics = () => {
    const context = useContext(LiveMetricsContext);
    if (context === undefined) {
        throw new Error('useLiveMetrics must be used within a LiveMetricsProvider');
    }
    return context;
};
