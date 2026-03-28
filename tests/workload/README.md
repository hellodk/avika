# Avika Workload Generator

Simulates a geo-distributed NGINX fleet with realistic HTTP traffic for testing the Avika dashboard, analytics, geo visualization, and alerting.

## What It Does

1. **Creates projects and environments** via the HTTP API (Global CDN, API Platform)
2. **Registers 57 agents** across 7 regions with auto-assignment labels
3. **Generates realistic HTTP access logs** with proper geo-IP mapping (uses well-known IPs from the gateway's GeoIP lookup)
4. **Sends NGINX metrics** (connections, CPU, memory, network)
5. **Populates ClickHouse** with traffic data for all dashboard pages

## Quick Start

### Via avk CLI (recommended)

```bash
./scripts/avk test workload
```

This will prompt you for:
- Config file path (default: `tests/workload/config.json`)
- Target RPS (default: 500)
- Duration (default: 5m)
- Mode: Full / Setup only / Traffic only

### Direct execution

```bash
# Build
go build -o bin/workload ./tests/workload/

# Setup projects & environments only
./bin/workload -config tests/workload/config.json -setup-only

# Run full simulation (setup + traffic)
./bin/workload -config tests/workload/config.json -rps 500 -duration 5m

# Traffic only (skip project creation)
./bin/workload -config tests/workload/config.json -skip-setup -rps 500 -duration 5m
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config` | `tests/workload/config.json` | Path to workload config file |
| `-rps` | `500` | Total requests per second across all agents |
| `-duration` | `5m` | How long to run (e.g. `30s`, `5m`, `1h`) |
| `-setup-only` | `false` | Only create projects/environments, don't send traffic |
| `-skip-setup` | `false` | Skip project creation, only send traffic |
| `-report` | `10s` | Metrics reporting interval |

## Configuration

All workload parameters are in `config.json`:

### Gateway

```json
{
  "gateway": {
    "grpc_address": "10.106.3.67:8443",
    "http_address": "https://ncn112.com/avika"
  }
}
```

- `grpc_address` — The gRPC endpoint agents connect to (K8s service IP or ingress)
- `http_address` — The HTTP API for creating projects/environments

### Projects & Environments

```json
{
  "projects": [
    {
      "name": "Global CDN",
      "slug": "global-cdn",
      "environments": [
        {"name": "Production", "slug": "production", "is_production": true},
        {"name": "Staging", "slug": "staging", "is_production": false}
      ]
    }
  ]
}
```

### Agent Groups

Each group creates N agents with labels for auto-assignment:

```json
{
  "agents": [
    {
      "id": "cdn-us-east-{i}",
      "project": "global-cdn",
      "environment": "production",
      "region": "us-east",
      "count": 8,
      "nginx_version": "1.26.2"
    }
  ]
}
```

`{i}` is replaced with `000`, `001`, etc.

### Regions & GeoIP

Each region defines client IPs and user agents. The client IPs **must match** the gateway's well-known IP database (`cmd/gateway/geo/geoip.go`) for geo data to populate correctly.

```json
{
  "regions": {
    "us-east": {
      "client_ips": ["8.8.8.8", "52.95.110.1", "34.117.59.81"],
      "user_agents": ["Mozilla/5.0 (Windows NT 10.0; ...)"]
    }
  }
}
```

**Current regions:** US East, EU West, AP South, AP Tokyo, LATAM, Africa, MENA

### Traffic Patterns

Weighted URI selection, status codes, HTTP methods, and referrers:

```json
{
  "traffic": {
    "uris": [
      {"path": "/api/v1/users", "weight": 12, "latency_ms": [10, 80]},
      {"path": "/health", "weight": 10, "latency_ms": [1, 5]}
    ],
    "status_weights": {"200": 55, "404": 6, "500": 2},
    "methods": {"GET": 65, "POST": 20, "PUT": 8}
  }
}
```

## Agent Distribution (57 total)

| Group | Project | Environment | Region | Count |
|-------|---------|-------------|--------|-------|
| cdn-us-east | Global CDN | Production | US East | 8 |
| cdn-eu-west | Global CDN | Production | EU West | 6 |
| cdn-ap-south | Global CDN | Production | AP South | 5 |
| cdn-staging | Global CDN | Staging | US East | 3 |
| api-us | API Platform | US East | US East | 10 |
| api-eu | API Platform | EU West | EU West | 8 |
| api-ap | API Platform | AP South | AP South | 6 |
| api-ap-tokyo | API Platform | AP South | AP Tokyo | 4 |
| cdn-latam | Global CDN | Production | LATAM | 3 |
| cdn-africa | Global CDN | Production | Africa | 2 |
| cdn-mena | Global CDN | Production | MENA | 2 |

## Traffic Mix

- **85% access logs** with geo-distributed client IPs
- **15% NGINX metrics** (connections, CPU, memory, network)
- **Heartbeats** every 15 seconds per agent
- Status codes: 55% 200, 8% 201, 6% 404, 4% 401, 2% 500, etc.
- Methods: 65% GET, 20% POST, 8% PUT, 4% DELETE, 3% PATCH

## How GeoIP Works

The gateway has an in-memory GeoIP database with ~30 well-known IPs (Google DNS, Cloudflare, AWS, etc.) mapped to real locations. When access logs arrive with `X-Forwarded-For` headers containing these IPs, the gateway enriches the ClickHouse record with country, city, latitude, longitude.

The workload config uses these exact IPs so that geo analytics, the world map, and visitor analytics all populate correctly.

For IPs not in the well-known list, the gateway falls back to rough first-octet guessing (Class A → US, Class B → Europe, Class C → Asia Pacific).

## File Structure

```
tests/workload/
  config.json   — All simulation parameters
  main.go       — Workload generator source
  README.md     — This file
```

## Examples

### Populate a demo environment quickly

```bash
./bin/workload -config tests/workload/config.json -rps 1000 -duration 2m
```

This creates ~120K access log entries across 7 regions in 2 minutes.

### Long-running background simulation

```bash
nohup ./bin/workload -config tests/workload/config.json \
  -skip-setup -rps 200 -duration 24h -report 1m \
  > workload.log 2>&1 &
```

### Custom config for a different cluster

```bash
cp tests/workload/config.json tests/workload/my-cluster.json
# Edit gateway addresses, auth, etc.
./bin/workload -config tests/workload/my-cluster.json -rps 500 -duration 10m
```
