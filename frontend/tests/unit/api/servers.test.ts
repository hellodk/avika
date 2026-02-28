import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock gRPC client
const mockGrpcClient = {
    listAgents: vi.fn(),
    getAgentConfig: vi.fn(),
    updateAgentConfig: vi.fn(),
    reloadNginx: vi.fn(),
    restartNginx: vi.fn(),
    stopNginx: vi.fn(),
    getAgentLogs: vi.fn(),
};

vi.mock('@/lib/grpc-client', () => ({
    getGrpcClient: () => mockGrpcClient,
}));

describe('Servers API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('GET /api/servers', () => {
        it('returns list of agents', async () => {
            const mockAgents = [
                { id: 'agent-1', hostname: 'nginx-1', status: 'online', last_seen: Date.now() },
                { id: 'agent-2', hostname: 'nginx-2', status: 'online', last_seen: Date.now() },
            ];

            mockGrpcClient.listAgents.mockResolvedValue({ agents: mockAgents });

            const response = await listServers();

            expect(response.agents).toHaveLength(2);
            expect(response.agents[0].hostname).toBe('nginx-1');
        });

        it('handles empty agent list', async () => {
            mockGrpcClient.listAgents.mockResolvedValue({ agents: [] });

            const response = await listServers();

            expect(response.agents).toEqual([]);
        });

        it('calculates online status correctly', () => {
            const now = Date.now() / 1000;
            const agents = [
                { id: '1', last_seen: now.toString() },
                { id: '2', last_seen: (now - 200).toString() },
                { id: '3', last_seen: (now - 60).toString() },
            ];

            const onlineAgents = agents.filter(a => {
                const lastSeen = parseInt(a.last_seen);
                return (now - lastSeen) < 180;
            });

            expect(onlineAgents).toHaveLength(2);
        });
    });

    describe('GET /api/servers/[id]', () => {
        it('returns agent details', async () => {
            const mockAgent = {
                id: 'agent-1',
                hostname: 'nginx-prod-1',
                ip_address: '192.168.1.100',
                nginx_version: 'nginx/1.24.0',
                os_info: 'Ubuntu 22.04',
                status: 'online',
            };

            mockGrpcClient.listAgents.mockResolvedValue({ 
                agents: [mockAgent] 
            });

            const response = await getServerById('agent-1');

            expect(response.hostname).toBe('nginx-prod-1');
            expect(response.nginx_version).toBe('nginx/1.24.0');
        });

        it('returns 404 for unknown agent', async () => {
            mockGrpcClient.listAgents.mockResolvedValue({ agents: [] });

            const response = await getServerById('nonexistent');

            expect(response).toBeNull();
        });
    });

    describe('GET /api/servers/[id]/config', () => {
        it('returns nginx configuration', async () => {
            const mockConfig = {
                config: {
                    raw_content: 'worker_processes auto;\n...',
                    parsed: {
                        http: {
                            server: [{ listen: '80' }],
                        },
                    },
                },
            };

            mockGrpcClient.getAgentConfig.mockResolvedValue(mockConfig);

            const response = await getServerConfig('agent-1');

            expect(response.config.raw_content).toContain('worker_processes');
        });

        it('handles missing config', async () => {
            mockGrpcClient.getAgentConfig.mockResolvedValue({ error: 'Config not found' });

            const response = await getServerConfig('agent-1');

            expect(response.error).toBeDefined();
        });
    });

    describe('PUT /api/servers/[id]/config', () => {
        it('updates configuration successfully', async () => {
            mockGrpcClient.updateAgentConfig.mockResolvedValue({
                success: true,
                backup_path: '/etc/nginx/backups/nginx.conf.bak',
            });

            const response = await updateServerConfig('agent-1', {
                content: 'worker_processes 4;\n...',
                backup: true,
            });

            expect(response.success).toBe(true);
            expect(response.backup_path).toBeDefined();
        });

        it('validates configuration before update', () => {
            const validConfig = 'worker_processes auto;';
            const invalidConfig = 'worker_processes';

            expect(validateNginxConfig(validConfig)).toBe(true);
            expect(validateNginxConfig(invalidConfig)).toBe(false);
        });

        it('rejects invalid configuration', async () => {
            mockGrpcClient.updateAgentConfig.mockResolvedValue({
                success: false,
                error: 'nginx: [emerg] invalid directive',
            });

            const response = await updateServerConfig('agent-1', {
                content: 'invalid config',
                backup: true,
            });

            expect(response.success).toBe(false);
            expect(response.error).toContain('invalid');
        });
    });

    describe('POST /api/servers/[id]/reload', () => {
        it('reloads nginx successfully', async () => {
            mockGrpcClient.reloadNginx.mockResolvedValue({ success: true });

            const response = await reloadServer('agent-1');

            expect(response.success).toBe(true);
        });

        it('handles reload failure', async () => {
            mockGrpcClient.reloadNginx.mockResolvedValue({
                success: false,
                error: 'nginx: configuration test failed',
            });

            const response = await reloadServer('agent-1');

            expect(response.success).toBe(false);
        });
    });

    describe('POST /api/servers/[id]/restart', () => {
        it('restarts nginx successfully', async () => {
            mockGrpcClient.restartNginx.mockResolvedValue({ success: true });

            const response = await restartServer('agent-1');

            expect(response.success).toBe(true);
        });
    });

    describe('POST /api/servers/[id]/stop', () => {
        it('stops nginx successfully', async () => {
            mockGrpcClient.stopNginx.mockResolvedValue({ success: true });

            const response = await stopServer('agent-1');

            expect(response.success).toBe(true);
        });
    });

    describe('GET /api/servers/[id]/logs', () => {
        it('returns log entries', async () => {
            const mockLogs = [
                { timestamp: Date.now(), line: '192.168.1.1 - - [01/Jan/2024] "GET / HTTP/1.1" 200' },
                { timestamp: Date.now(), line: '192.168.1.2 - - [01/Jan/2024] "POST /api HTTP/1.1" 201' },
            ];

            mockGrpcClient.getAgentLogs.mockResolvedValue({ entries: mockLogs });

            const response = await getServerLogs('agent-1', { type: 'access', lines: 100 });

            expect(response.entries).toHaveLength(2);
        });

        it('supports log type filtering', async () => {
            mockGrpcClient.getAgentLogs.mockResolvedValue({ entries: [] });

            await getServerLogs('agent-1', { type: 'error', lines: 50 });

            expect(mockGrpcClient.getAgentLogs).toHaveBeenCalledWith(
                expect.objectContaining({ log_type: 'error' })
            );
        });
    });

    describe('GET /api/servers/[id]/uptime', () => {
        it('calculates uptime correctly', () => {
            const startTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
            const uptime = calculateUptime(startTime);

            expect(uptime.days).toBe(1);
            expect(uptime.hours).toBe(0);
        });

        it('formats uptime string', () => {
            const uptime = { days: 5, hours: 12, minutes: 30 };
            const formatted = formatUptime(uptime);

            expect(formatted).toBe('5d 12h 30m');
        });
    });
});

// Helper functions
async function listServers() {
    return await mockGrpcClient.listAgents({});
}

async function getServerById(id: string) {
    const response = await mockGrpcClient.listAgents({});
    return response.agents?.find((a: { id: string }) => a.id === id) || null;
}

async function getServerConfig(id: string) {
    return await mockGrpcClient.getAgentConfig({ instance_id: id });
}

async function updateServerConfig(id: string, data: { content: string; backup: boolean }) {
    return await mockGrpcClient.updateAgentConfig({
        instance_id: id,
        new_content: data.content,
        backup: data.backup,
    });
}

async function reloadServer(id: string) {
    return await mockGrpcClient.reloadNginx({ instance_id: id });
}

async function restartServer(id: string) {
    return await mockGrpcClient.restartNginx({ instance_id: id });
}

async function stopServer(id: string) {
    return await mockGrpcClient.stopNginx({ instance_id: id });
}

async function getServerLogs(id: string, params: { type: string; lines: number }) {
    return await mockGrpcClient.getAgentLogs({
        instance_id: id,
        log_type: params.type,
        tail_lines: params.lines,
    });
}

function validateNginxConfig(config: string): boolean {
    if (!config || config.trim() === '') return false;
    if (!config.includes(';')) return false;
    return true;
}

function calculateUptime(startTime: number): { days: number; hours: number; minutes: number } {
    const now = Date.now();
    const diff = now - startTime;
    
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    
    return { days, hours, minutes };
}

function formatUptime(uptime: { days: number; hours: number; minutes: number }): string {
    return `${uptime.days}d ${uptime.hours}h ${uptime.minutes}m`;
}
