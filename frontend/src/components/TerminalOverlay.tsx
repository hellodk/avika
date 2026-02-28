"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { apiFetch } from '@/lib/api';

interface TerminalOverlayProps {
    agentId: string;
    onClose: () => void;
}

export const TerminalOverlay: React.FC<TerminalOverlayProps> = ({ agentId, onClose }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#0a0a0a',
            }
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        
        term.writeln('\x1b[1;33mFetching gateway configuration...\x1b[0m');

        // Fetch gateway config from server (which can resolve K8s DNS)
        const connectToTerminal = async () => {
            const encodedAgentId = encodeURIComponent(agentId);
            let wsUrl: string;
            
            try {
                const res = await apiFetch('/api/config');
                if (res.ok) {
                    const config = await res.json();
                    wsUrl = `${config.gateway.wsUrl}/terminal?agent_id=${encodedAgentId}`;
                } else {
                    // Fallback: use current hostname with gateway port
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    wsUrl = `${protocol}//${window.location.hostname}:5021/terminal?agent_id=${encodedAgentId}`;
                }
            } catch (e) {
                // Fallback on error
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl = `${protocol}//${window.location.hostname}:5021/terminal?agent_id=${encodedAgentId}`;
            }
            
            term.writeln(`\x1b[1;33mConnecting to ${wsUrl}...\x1b[0m`);
            
            let socket: WebSocket;
            try {
                socket = new WebSocket(wsUrl);
            } catch (err) {
                term.writeln(`\x1b[1;31mFailed to create WebSocket: ${err}\x1b[0m`);
                setConnectionStatus('error');
                setErrorMessage(String(err));
                return;
            }
            socketRef.current = socket;

            socket.onopen = () => {
                term.writeln('\x1b[1;32mConnected to pod terminal...\x1b[0m');
                setConnectionStatus('connected');
            };

            socket.onerror = (event) => {
                term.writeln(`\x1b[1;31mWebSocket error - check if gateway port 5021 is accessible\x1b[0m`);
                setConnectionStatus('error');
                setErrorMessage('Connection failed. Ensure gateway WebSocket port is accessible.');
            };

            socket.onmessage = async (event) => {
                if (event.data instanceof Blob) {
                    const text = await event.data.text();
                    term.write(text);
                } else {
                    term.write(event.data);
                }
            };

            socket.onclose = (event) => {
                if (event.code !== 1000) {
                    term.writeln(`\r\n\x1b[1;31mConnection closed (code: ${event.code})\x1b[0m`);
                } else {
                    term.writeln('\r\n\x1b[1;33mSession ended\x1b[0m');
                }
            };

            term.onData((data) => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(data);
                }
            });
        };
        
        connectToTerminal();

        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        // Terminate on Escape key
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleEsc);
            if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
                socketRef.current.close();
            }
            term.dispose();
        };
    }, [agentId, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl h-[600px] bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/20 hover:bg-red-500 transition-colors cursor-pointer" onClick={onClose} title="Close" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/20" />
                            <div className="w-3 h-3 rounded-full bg-green-500/20" />
                        </div>
                        <span className="text-sm font-medium text-neutral-400 ml-2">Terminal: {agentId}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>
                <div ref={terminalRef} className="flex-1 p-2 bg-[#0a0a0a]" />
            </div>
        </div>
    );
};
