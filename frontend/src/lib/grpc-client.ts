import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Try multiple proto file locations for dev vs production
const PROTO_PATHS = [
    path.resolve(process.cwd(), 'proto/agent.proto'),           // In Docker: /app/proto/agent.proto
    path.resolve(process.cwd(), '../api/proto/agent.proto'),    // Local dev from frontend dir
    '/app/proto/agent.proto',                                    // Docker fallback
];

function findProtoPath(): string {
    const fs = require('fs');
    for (const protoPath of PROTO_PATHS) {
        try {
            if (fs.existsSync(protoPath)) {
                return protoPath;
            }
        } catch {
            // Continue to next path
        }
    }
    throw new Error(`Proto file not found. Searched: ${PROTO_PATHS.join(', ')}`);
}

const PROTO_PATH = findProtoPath();

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
// Adjust based on package name in proto: package nginx.agent.v1;
const agentWrapper = protoDescriptor.nginx.agent.v1;

// Gateway address from environment or default (gRPC port is 5020)
const GATEWAY_GRPC_ADDR = process.env.GATEWAY_GRPC_ADDR || process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/^https?:\/\//, '') || 'avika-gateway:5020';

let clientInstance: any = null;

export const getAgentServiceClient = () => {
    if (!clientInstance) {
        clientInstance = new agentWrapper.AgentService(
            GATEWAY_GRPC_ADDR,
            grpc.credentials.createInsecure()
        );
    }
    return clientInstance;
};
