
'use client';

import { useState } from 'react';
import { apiFetch } from "@/lib/api";
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle } from 'lucide-react';

export default function TestPage() {
    const [results, setResults] = useState<any[]>([]);

    const runTests = async () => {
        const tests = [];

        // 1. Analytics API
        try {
            const start = performance.now();
            const res = await apiFetch('/api/analytics?window=1h');
            const data = await res.json();
            const duration = (performance.now() - start).toFixed(1);

            if (res.ok && data.system_metrics) {
                tests.push({
                    name: 'Analytics API',
                    status: 'PASS',
                    details: `Success in ${duration}ms. ${data.recent_requests?.length || 0} logs found.`
                });
            } else {
                tests.push({
                    name: 'Analytics API',
                    status: 'FAIL',
                    details: `Failed. HTTP ${res.status}. Error: ${data.error || 'Unknown'}`
                });
            }
        } catch (e: any) {
            tests.push({ name: 'Analytics API', status: 'FAIL', details: e.message });
        }

        // 2. Provisions API (Pre-flight check)
        try {
            const start = performance.now();
            // Send empty payload or invalid to verify API structure
            const res = await apiFetch('/api/provisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: 'test-agent', template: 'rate-limiting' })
            });
            const data = await res.json();
            const duration = (performance.now() - start).toFixed(1);

            // Expect success (even if agent not found, gateway returns error with specific message)
            if (res.ok || (data.error && data.error.includes("not found"))) {
                tests.push({
                    name: 'Provisions API',
                    status: 'PASS',
                    details: `API responded in ${duration}ms. Output: ${JSON.stringify(data).substring(0, 50)}...`
                });
            } else {
                tests.push({
                    name: 'Provisions API',
                    status: 'FAIL',
                    details: `HTTP ${res.status}: ${JSON.stringify(data)}`
                });
            }

        } catch (e: any) {
            tests.push({ name: 'Provisions API', status: 'FAIL', details: e.message });
        }

        setResults(tests);
    };

    return (
        <div className="p-8 space-y-6">
            <h1 className="text-3xl font-bold">System Diagnostics</h1>
            <p className="text-muted-foreground">Self-test suite for NGINX Manager components.</p>

            <Button onClick={runTests} size="lg">Run Diagnostics</Button>

            <div className="grid gap-4 mt-6">
                {results.map((r, i) => (
                    <Card key={i} className={`border-l-4 ${r.status === 'PASS' ? 'border-l-green-500' : 'border-l-red-500'}`}>
                        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                {r.status === 'PASS' ? <CheckCircle className="text-green-500" /> : <XCircle className="text-red-500" />}
                                {r.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="font-mono text-sm bg-slate-100 p-2 rounded">{r.details}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
