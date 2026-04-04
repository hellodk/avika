import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { serversDeleteUsesGrpc } from "@/lib/servers-bff-transport";

describe("serversDeleteUsesGrpc", () => {
    const env = process.env;

    beforeEach(() => {
        vi.stubEnv("SERVERS_DELETE_USE_GRPC", "");
        vi.stubEnv("SERVERS_LIST_USE_GRPC", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        Object.assign(process.env, env);
    });

    it("returns true when SERVERS_DELETE_USE_GRPC=true", () => {
        vi.stubEnv("SERVERS_DELETE_USE_GRPC", "true");
        vi.stubEnv("SERVERS_LIST_USE_GRPC", "false");
        expect(serversDeleteUsesGrpc()).toBe(true);
    });

    it("returns false when SERVERS_DELETE_USE_GRPC=false even if list uses gRPC", () => {
        vi.stubEnv("SERVERS_DELETE_USE_GRPC", "false");
        vi.stubEnv("SERVERS_LIST_USE_GRPC", "true");
        expect(serversDeleteUsesGrpc()).toBe(false);
    });

    it("follows SERVERS_LIST_USE_GRPC when SERVERS_DELETE_USE_GRPC unset", () => {
        vi.stubEnv("SERVERS_LIST_USE_GRPC", "true");
        expect(serversDeleteUsesGrpc()).toBe(true);
        vi.stubEnv("SERVERS_LIST_USE_GRPC", "false");
        expect(serversDeleteUsesGrpc()).toBe(false);
    });
});
