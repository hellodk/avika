/**
 * gRPC unary responses often use `bool success`. With proto-loader defaults, missing fields
 * can be ambiguous; only treat **explicit** `success: false` as failure.
 */
export function isGrpcExplicitFailure(response: unknown): boolean {
    if (response === null || typeof response !== 'object') return false;
    return (response as { success?: boolean }).success === false;
}
