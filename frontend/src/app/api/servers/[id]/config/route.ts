import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL =
  process.env.GATEWAY_HTTP_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "http://avika-gateway:5021";

// GET /api/servers/[id]/config - Get agent configuration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const sessionCookie = request.cookies.get("avika_session")?.value;
        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${id}/config`, {
            method: "GET",
            headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
        });

        const data = await gatewayResponse.json();
        if (!gatewayResponse.ok) {
            return NextResponse.json(data, { status: gatewayResponse.status });
        }

        const gatewayAddress = (data.gateway_address || "").toString();
        const gatewayAddresses = gatewayAddress
            ? gatewayAddress.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [""];

        let updateIntervalSeconds = 604800;
        const updateInterval = (data.update_interval || "").toString();
        if (updateInterval) {
            // Accept "168h", "30s", or numeric seconds in string form.
            const asNum = Number(updateInterval);
            if (!Number.isNaN(asNum) && asNum > 0) {
                updateIntervalSeconds = Math.floor(asNum);
            } else {
                const match = updateInterval.match(/^(\d+)\s*s$/);
                if (match) updateIntervalSeconds = Number(match[1]);
            }
        }

        return NextResponse.json({
            agent_id: data.agent_id || id,
            gateway_addresses: gatewayAddresses.length ? gatewayAddresses : [""],
            multi_gateway_mode: gatewayAddresses.length > 1,
            nginx_status_url: data.nginx_status_url || "http://127.0.0.1/nginx_status",
            access_log_path: data.access_log_path || "/var/log/nginx/access.log",
            error_log_path: data.error_log_path || "/var/log/nginx/error.log",
            nginx_config_path: data.nginx_config_path || "/etc/nginx/nginx.conf",
            log_format: data.log_format || "combined",
            log_level: data.log_level || "info",
            health_port: data.health_port || 5026,
            mgmt_port: data.mgmt_port || 5025,
            update_server: data.update_server || "",
            update_interval_seconds: updateIntervalSeconds,
            metrics_interval_seconds: 1,
            heartbeat_interval_seconds: 1,
            enable_vts_metrics: true,
            enable_log_streaming: true,
            auto_apply_config: true,
        });
    } catch (error) {
        console.error("Failed to fetch agent config", error);
        return NextResponse.json({ error: "Failed to fetch agent config" }, { status: 500 });
    }
}

// POST /api/servers/[id]/config - Update agent configuration
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await request.json();
        const sessionCookie = request.cookies.get("avika_session")?.value;

        const gatewayAddresses: string[] = Array.isArray(body.gateway_addresses)
            ? body.gateway_addresses.map((s: unknown) => String(s)).filter((s: string) => s.trim() !== "")
            : [];

        const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${id}/config`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
            },
            body: JSON.stringify({
                config: {
                    agent_id: id,
                    gateway_addresses: gatewayAddresses,
                    multi_gateway_mode: gatewayAddresses.length > 1,
                    nginx_status_url: body.nginx_status_url,
                    access_log_path: body.access_log_path,
                    error_log_path: body.error_log_path,
                    nginx_config_path: body.nginx_config_path,
                    log_format: body.log_format,
                    health_port: body.health_port,
                    mgmt_port: body.mgmt_port,
                    log_level: body.log_level,
                    buffer_dir: body.buffer_dir,
                    update_server: body.update_server,
                    update_interval_seconds: body.update_interval_seconds,
                },
                persist: true,
                hot_reload: true,
            }),
        });

        const data = await gatewayResponse.json();
        return NextResponse.json(data, { status: gatewayResponse.status });
    } catch (error) {
        console.error("Failed to update agent config", error);
        return NextResponse.json({ error: "Failed to update agent config" }, { status: 500 });
    }
}
