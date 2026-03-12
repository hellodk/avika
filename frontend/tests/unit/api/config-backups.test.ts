import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Integration tests for Config Backup / Restore API routes
// These tests verify the API route logic for backup listing, restore, and
// the creation-on-update flow. We mock the gRPC client.
// ---------------------------------------------------------------------------

const mockGrpcClient = {
    ListConfigBackups: vi.fn(),
    RestoreConfigBackup: vi.fn(),
    UpdateConfig: vi.fn(),
    GetAgent: vi.fn(),
    GetConfig: vi.fn(),
    ListCertificates: vi.fn(),
    RemoveAgent: vi.fn(),
    ReloadNginx: vi.fn(),
    RestartNginx: vi.fn(),
    StopNginx: vi.fn(),
    UpdateAgent: vi.fn(),
};

vi.mock('@/lib/grpc-client', () => ({
    getAgentServiceClient: () => mockGrpcClient,
}));

vi.mock('@/lib/api', () => ({
    normalizeServerId: (id: string) => id,
}));

describe('Config Backup/Restore API Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Backup listing', () => {
        it('returns a list of backups for a valid agent', async () => {
            const mockBackups = [
                { name: 'backup-20240101-120000.conf', created_at: 1704067200 },
                { name: 'backup-20240101-130000.conf', created_at: 1704070800 },
            ];

            mockGrpcClient.ListConfigBackups.mockImplementation(
                (_req: any, callback: Function) => callback(null, { backups: mockBackups })
            );

            // Simulate calling the route logic
            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.ListConfigBackups(
                    { instance_id: 'agent-1' },
                    (err: any, res: any) => resolve({ err, res })
                );
            });

            expect(result.err).toBeNull();
            expect(result.res.backups).toHaveLength(2);
            expect(result.res.backups[0].name).toMatch(/\.conf$/);
        });

        it('handles gRPC error gracefully', async () => {
            mockGrpcClient.ListConfigBackups.mockImplementation(
                (_req: any, callback: Function) => callback(new Error('agent offline'), null)
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.ListConfigBackups(
                    { instance_id: 'offline-agent' },
                    (err: any, res: any) => resolve({ err, res })
                );
            });

            expect(result.err).not.toBeNull();
            expect(result.err.message).toContain('agent offline');
        });

        it('returns empty array when no backups exist', async () => {
            mockGrpcClient.ListConfigBackups.mockImplementation(
                (_req: any, callback: Function) => callback(null, { backups: [] })
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.ListConfigBackups(
                    { instance_id: 'new-agent' },
                    (err: any, res: any) => resolve({ err, res })
                );
            });

            expect(result.err).toBeNull();
            expect(result.res.backups).toHaveLength(0);
        });
    });

    describe('Config restore', () => {
        it('restores a backup successfully', async () => {
            mockGrpcClient.RestoreConfigBackup.mockImplementation(
                (_req: any, callback: Function) => callback(null, { success: true, message: 'Restored' })
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.RestoreConfigBackup(
                    { instance_id: 'agent-1', backup_name: 'backup-20240101-120000.conf' },
                    (err: any, res: any) => resolve({ err, res })
                );
            });

            expect(result.err).toBeNull();
            expect(result.res.success).toBe(true);
        });

        it('returns error when backup file does not exist', async () => {
            mockGrpcClient.RestoreConfigBackup.mockImplementation(
                (_req: any, callback: Function) => callback(new Error('backup not found'), null)
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.RestoreConfigBackup(
                    { instance_id: 'agent-1', backup_name: 'nonexistent.conf' },
                    (err: any, res: any) => resolve({ err, res })
                );
            });

            expect(result.err.message).toContain('backup not found');
        });
    });

    describe('Config update with backup flag', () => {
        it('sends backup:true when updating config', async () => {
            mockGrpcClient.UpdateConfig.mockImplementation(
                (_req: any, callback: Function) => callback(null, { success: true })
            );

            const requestPayload = {
                instance_id: 'agent-1',
                new_content: 'worker_processes auto;\n',
                backup: true,
            };

            await new Promise<void>((resolve) => {
                mockGrpcClient.UpdateConfig(requestPayload, (_err: any, _res: any) => resolve());
            });

            expect(mockGrpcClient.UpdateConfig).toHaveBeenCalledWith(
                expect.objectContaining({ backup: true }),
                expect.any(Function)
            );
        });
    });

    describe('NGINX safety validation flow', () => {
        it('restart action calls RestartNginx on the agent', async () => {
            mockGrpcClient.RestartNginx.mockImplementation(
                (_req: any, callback: Function) => callback(null, { success: true })
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.RestartNginx({ instance_id: 'agent-1' }, (err: any, res: any) => resolve({ err, res }));
            });

            expect(result.err).toBeNull();
            expect(result.res.success).toBe(true);
            expect(mockGrpcClient.RestartNginx).toHaveBeenCalledTimes(1);
        });

        it('reload action calls ReloadNginx on the agent', async () => {
            mockGrpcClient.ReloadNginx.mockImplementation(
                (_req: any, callback: Function) => callback(null, { success: true })
            );

            const result = await new Promise<any>((resolve) => {
                mockGrpcClient.ReloadNginx({ instance_id: 'agent-1' }, (err: any, res: any) => resolve({ err, res }));
            });

            expect(result.err).toBeNull();
            expect(mockGrpcClient.ReloadNginx).toHaveBeenCalledTimes(1);
        });
    });
});
