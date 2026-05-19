/**
 * Keep inventory list and delete on the same BFF → gateway transport when possible.
 * If SERVERS_DELETE_USE_GRPC is unset, follow SERVERS_LIST_USE_GRPC so environments
 * that only wire gRPC still get working deletes.
 */
export function serversDeleteUsesGrpc(): boolean {
    if (process.env.SERVERS_DELETE_USE_GRPC === "true") return true;
    if (process.env.SERVERS_DELETE_USE_GRPC === "false") return false;
    return process.env.SERVERS_LIST_USE_GRPC === "true";
}
