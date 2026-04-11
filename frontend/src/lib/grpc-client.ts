import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'node:fs';
import path from 'path';

// Try multiple proto file locations for dev vs production
const PROTO_PATHS = [
    path.resolve(process.cwd(), 'proto/agent.proto'),           // In Docker: /app/proto/agent.proto
    path.resolve(process.cwd(), '../api/proto/agent.proto'),    // Local dev from frontend dir
    '/app/proto/agent.proto',                                    // Docker fallback
];

function findProtoPath(): string {
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

// grpc.loadPackageDefinition returns a loosely typed tree; AgentService is generated from proto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- proto dynamic package shape
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const agentWrapper = protoDescriptor.nginx.agent.v1;

type AgentServiceConstructor = typeof agentWrapper.AgentService;
type AgentServiceClient = InstanceType<AgentServiceConstructor>;

// Gateway address from environment or default (gRPC port is 5020)
const GATEWAY_GRPC_ADDR = process.env.GATEWAY_GRPC_ADDR || process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/^https?:\/\//, '') || 'localhost:5020';
const ENABLE_TLS = process.env.ENABLE_TLS === 'true' || process.env.GATEWAY_TLS === 'true';
const CA_CERT_FILE = process.env.TLS_CA_CERT_FILE;
/** Client certificate + key for mTLS to gateway gRPC (both required if either is set). */
const TLS_CLIENT_CERT_FILE =
    process.env.TLS_CLIENT_CERT_FILE || process.env.GRPC_TLS_CLIENT_CERT_FILE;
const TLS_CLIENT_KEY_FILE =
    process.env.TLS_CLIENT_KEY_FILE || process.env.GRPC_TLS_CLIENT_KEY_FILE;

let clientInstance: AgentServiceClient | null = null;

function buildChannelCredentials(): grpc.ChannelCredentials {
    if (!ENABLE_TLS) {
        return grpc.credentials.createInsecure();
    }

    let rootCerts: Buffer | undefined;
    if (CA_CERT_FILE && fs.existsSync(CA_CERT_FILE)) {
        rootCerts = fs.readFileSync(CA_CERT_FILE);
    }

    const certPath = TLS_CLIENT_CERT_FILE?.trim();
    const keyPath = TLS_CLIENT_KEY_FILE?.trim();
    let privateKey: Buffer | undefined;
    let certChain: Buffer | undefined;

    if (certPath && keyPath) {
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            throw new Error(
                `mTLS: TLS_CLIENT_CERT_FILE / TLS_CLIENT_KEY_FILE paths must exist (got cert=${certPath}, key=${keyPath})`
            );
        }
        privateKey = fs.readFileSync(keyPath);
        certChain = fs.readFileSync(certPath);
    } else if (certPath || keyPath) {
        throw new Error(
            'mTLS: set both TLS_CLIENT_CERT_FILE and TLS_CLIENT_KEY_FILE (or GRPC_TLS_* aliases) for client identity'
        );
    }

    return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
}

export const getAgentServiceClient = (): AgentServiceClient => {
    if (!clientInstance) {
        const credentials = buildChannelCredentials();

        clientInstance = new agentWrapper.AgentService(
            GATEWAY_GRPC_ADDR,
            credentials
        );
    }
    return clientInstance;
};
