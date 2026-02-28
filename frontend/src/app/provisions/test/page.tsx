"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Check, X, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface TestScenario {
    id: string;
    name: string;
    template: string;
    config: Record<string, any>;
    expectedSubstrings: string[];
}

interface TestResult {
    scenarioId: string;
    status: 'pending' | 'running' | 'pass' | 'fail';
    actual?: string;
    error?: string;
}

const scenarios: TestScenario[] = [
    {
        id: "rate-limiting",
        name: "Rate Limiting",
        template: "rate-limiting",
        config: { requests_per_minute: 10, burst_size: 5 },
        expectedSubstrings: ["rate=10r/m", "burst=5"]
    },
    {
        id: "health-check",
        name: "Health Checks",
        template: "health-checks",
        config: { upstream_name: "test_backend", servers: "server 1.2.3.4:80;", interval: 5000 },
        expectedSubstrings: ["upstream test_backend", "server 1.2.3.4", "interval=5000"]
    },
    {
        id: "location-block",
        name: "Location Blocks",
        template: "location-blocks",
        config: { path: "/secure", directives: "auth_basic \"Restricted\";" },
        expectedSubstrings: ["location /secure", "auth_basic \"Restricted\""]
    },
    {
        id: "error-page",
        name: "Error Pages",
        template: "error-pages",
        config: { error_codes: "403 404", page_path: "/custom_error.html" },
        expectedSubstrings: ["error_page 403 404", "location = /custom_error.html"]
    },
    {
        id: "custom",
        name: "Custom Provision",
        template: "custom",
        config: { raw_config: "server { listen 8080; }" },
        expectedSubstrings: ["listen 8080"]
    }
];

export default function ProvisionsTestRunner() {
    const [results, setResults] = useState<Record<string, TestResult>>({});
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        const newResults: Record<string, TestResult> = {};

        // Initialize results
        scenarios.forEach(s => {
            newResults[s.id] = { scenarioId: s.id, status: 'pending' };
        });
        setResults(newResults);

        for (const scenario of scenarios) {
            setResults(prev => ({
                ...prev,
                [scenario.id]: { ...prev[scenario.id], status: 'running' }
            }));

            try {
                // Mock instance ID for test
                const agentId = "test-agent-001";

                const res = await apiFetch('/api/provisions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instance_id: agentId,
                        template: scenario.template,
                        config: scenario.config
                    })
                });

                if (!res.ok) {
                    throw new Error(`API returned ${res.status}`);
                }

                const data = await res.json();
                const preview = data.preview || "";

                const missing = scenario.expectedSubstrings.find(sub => !preview.includes(sub));

                if (missing) {
                    setResults(prev => ({
                        ...prev,
                        [scenario.id]: {
                            scenarioId: scenario.id,
                            status: 'fail',
                            actual: preview,
                            error: `Missing substring: "${missing}"`
                        }
                    }));
                } else {
                    setResults(prev => ({
                        ...prev,
                        [scenario.id]: {
                            scenarioId: scenario.id,
                            status: 'pass',
                            actual: preview
                        }
                    }));
                }

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                setResults(prev => ({
                    ...prev,
                    [scenario.id]: {
                        scenarioId: scenario.id,
                        status: 'fail',
                        error: errorMessage
                    }
                }));
            }

            // tiny delay for visuals
            await new Promise(r => setTimeout(r, 200));
        }
        setIsRunning(false);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <div className="h-4 w-4 rounded-full bg-neutral-800" />;
            case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case 'pass': return <Check className="h-4 w-4 text-green-500" />;
            case 'fail': return <X className="h-4 w-4 text-red-500" />;
            default: return null;
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/provisions">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: `rgb(var(--theme-text))` }}>Provisions Self-Test Runner</h1>
                        <p className="text-sm" style={{ color: `rgb(var(--theme-text-muted))` }}>
                            Client-side integration tests for the Provisioning API.
                        </p>
                    </div>
                </div>
                <Button onClick={runTests} disabled={isRunning} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</> : <><Play className="mr-2 h-4 w-4" /> Run All Tests</>}
                </Button>
            </div>

            <Card style={{ background: `rgb(var(--theme-surface))`, borderColor: `rgb(var(--theme-border))` }}>
                <CardHeader>
                    <CardTitle>Test Results</CardTitle>
                    <CardDescription>
                        Scenarios check if the generated NGINX configuration snippet contains expected directives.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-neutral-800 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-neutral-900/50 text-neutral-400 font-medium">
                                <tr>
                                    <th className="p-4 w-12 text-center">Status</th>
                                    <th className="p-4 w-48">Scenario</th>
                                    <th className="p-4 w-64 hidden md:table-cell">Input Definition</th>
                                    <th className="p-4">Result / Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {scenarios.map((scenario) => {
                                    const result = results[scenario.id];
                                    return (
                                        <tr key={scenario.id} className="hover:bg-neutral-900/30 transition-colors">
                                            <td className="p-4 flex justify-center">
                                                {getStatusIcon(result?.status || 'pending')}
                                            </td>
                                            <td className="p-4 font-medium" style={{ color: `rgb(var(--theme-text))` }}>
                                                {scenario.name}
                                                <div className="text-xs text-neutral-500 font-mono mt-1">{scenario.template}</div>
                                            </td>
                                            <td className="p-4 hidden md:table-cell">
                                                <pre className="text-xs text-neutral-500 overflow-x-auto max-w-[200px]">
                                                    {JSON.stringify(scenario.config, null, 2)}
                                                </pre>
                                            </td>
                                            <td className="p-4">
                                                {result?.status === 'fail' && (
                                                    <div className="text-red-400 font-mono text-xs bg-red-950/30 p-2 rounded">
                                                        Error: {result.error}
                                                        {result.actual && (
                                                            <div className="mt-2 pt-2 border-t border-red-900/50 text-neutral-400">
                                                                Actual: {result.actual.substring(0, 50)}...
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {result?.status === 'pass' && (
                                                    <div className="text-green-500 text-xs flex items-center gap-2">
                                                        <Check className="h-3 w-3" />
                                                        Verified ({scenario.expectedSubstrings.length} checks passed)
                                                    </div>
                                                )}
                                                {(!result || result.status === 'pending') && (
                                                    <span className="text-neutral-600 italic">Waiting to run...</span>
                                                )}
                                                {result?.status === 'running' && (
                                                    <span className="text-blue-500 animate-pulse">Testing...</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
