# Avika Workload Generator

Simulates a geo-distributed NGINX fleet with realistic HTTP traffic for testing dashboards, analytics, geo visualization, visitor analytics, and alerting.

## Features

- **57 agents** across **8 regions** (US, EU, India, Japan/Korea, LATAM, Africa, MENA, Oceania)
- **28 geo-mapped IPs** from the gateway's well-known GeoIP database
- **Realistic device distribution**: 55% mobile, 35% desktop, 5% tablet, 5% bots
- **Bot traffic**: Googlebot, Bingbot, YandexBot, Facebook, Twitter, LinkedIn crawlers
- **Diverse referrers**: Google, Bing, DuckDuckGo, Reddit, HN, GitHub, social media
- **24 URI patterns** with weighted selection and latency profiles
- **16 HTTP status codes** with realistic distribution (55% 200, 6% 404, etc.)
- **Historical backfill**: Fill past 24h/7d of data rapidly for time-series charts
- **Project/environment auto-setup** via HTTP API

## Quick Start

### Via avk CLI

```bash
./scripts/avk test workload
```

Prompts for config, RPS, mode (real-time / backfill / setup-only).

### Direct execution

```bash
# Build
go build -o bin/workload ./tests/workload/

# Real-time traffic (5 minutes at 500 RPS)
./bin/workload -config tests/workload/config.json -rps 500 -duration 5m

# Historical backfill (fill 24h of data)
./bin/workload -config tests/workload/config.json -rps 1000 -backfill 24h

# Setup projects & environments only
./bin/workload -config tests/workload/config.json -setup-only

# Skip setup, just send traffic
./bin/workload -config tests/workload/config.json -skip-setup -rps 500 -duration 5m
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-config` | `tests/workload/config.json` | Config file path |
| `-rps` | `500` | Total RPS across all agents |
| `-duration` | `5m` | Real-time traffic duration |
| `-backfill` | `0` | Historical backfill window (e.g. `24h`, `168h` for 7 days) |
| `-setup-only` | `false` | Only create projects/environments |
| `-skip-setup` | `false` | Skip project creation |
| `-report` | `10s` | Metrics report interval |

## Agent Distribution (57 total)

| Group | Project | Environment | Region | Count | Geo Countries |
|-------|---------|-------------|--------|-------|---------------|
| cdn-us-east | Global CDN | Production | US East | 8 | US (6 cities) |
| cdn-eu-west | Global CDN | Production | EU West | 6 | NL, UK, DE, FR, RU |
| cdn-ap-south | Global CDN | Production | AP South | 5 | IN (2 cities), SG |
| cdn-staging | Global CDN | Staging | US East | 3 | US |
| api-us | API Platform | US East | US East | 10 | US, CA |
| api-eu | API Platform | EU West | EU West | 8 | NL, UK, DE, FR, RU |
| api-ap | API Platform | AP South | AP South | 6 | IN, SG |
| api-ap-tokyo | API Platform | AP South | AP Tokyo | 4 | JP (2 cities), KR |
| cdn-latam | Global CDN | Production | LATAM | 3 | BR, MX |
| cdn-africa | Global CDN | Production | Africa | 2 | ZA, NG |
| cdn-mena | Global CDN | Production | MENA | 2 | AE, CN |

## Traffic Profile

### Device Distribution (per region)
- **55% mobile**: iPhone, Samsung Galaxy, Pixel, Xiaomi, TECNO, Samsung Browser
- **35% desktop**: Chrome, Firefox, Safari, Edge, Opera (Windows, macOS, Linux)
- **5% tablet**: iPad, Samsung Galaxy Tab
- **5% bots**: Googlebot, Bingbot, YandexBot, Facebook, Twitter, LinkedIn, curl, python-requests

### Status Codes
```
200: 55%  201: 8%  204: 3%  206: 1%
301: 4%   302: 3%  304: 5%
400: 3%   401: 4%  403: 2%  404: 6%  405: 1%  429: 2%
500: 1%   502: 1%  503: 1%  504: 1%
```

### Referrers
- 40% direct (no referrer)
- 15% Google Search (varied queries)
- 5% Bing/DuckDuckGo/Yahoo/Yandex
- 10% social (Reddit, HN, Twitter, LinkedIn, Facebook)
- 5% GitHub
- 5% dev platforms (StackOverflow, dev.to, Medium)

### URIs (24 patterns)
Weighted selection with latency profiles per URI:
- `/` (15%) — 5-30ms
- `/api/v1/users` (12%) — 10-80ms
- `/health` (10%) — 1-5ms
- `/static/js/app.bundle.js` (6%) — 2-10ms
- `/api/v1/search` (5%) — 50-500ms
- 5xx errors get 3-5x latency multiplier

## How GeoIP Mapping Works

The gateway has 28 hardcoded well-known IPs in `cmd/gateway/geo/geoip.go`. Each IP maps to a specific country/city/coordinates. The workload generator uses **only these IPs** as `X-Forwarded-For` headers, so every access log gets accurate geo enrichment.

For the full IP→location mapping, see the `regions` variable in `main.go`.

## Backfill Mode

Backfill sends historical data with timestamps spread across the backfill window:

```bash
# Fill the last 24 hours with ~1000 req/s worth of data
./bin/workload -config tests/workload/config.json -rps 1000 -backfill 24h
```

Each agent generates `rps_per_agent * backfill_seconds` entries with evenly spaced timestamps. This populates time-series charts, hourly distributions, and trend comparisons.

## Examples

```bash
# Quick demo: 2 min, 200 RPS
./bin/workload -skip-setup -rps 200 -duration 2m

# Full dashboard population: backfill 24h then live
./bin/workload -rps 1000 -backfill 24h
./bin/workload -skip-setup -rps 500 -duration 1h

# Custom cluster
cp tests/workload/config.json tests/workload/my-cluster.json
# Edit gateway addresses...
./bin/workload -config tests/workload/my-cluster.json -rps 500 -duration 10m
```
