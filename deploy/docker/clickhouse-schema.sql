CREATE DATABASE IF NOT EXISTS nginx_analytics;

USE nginx_analytics;

-- Access logs table
CREATE TABLE IF NOT EXISTS access_logs (
    timestamp DateTime,
    instance_id String,
    remote_addr String,
    request_method String,
    request_uri String,
    status UInt16,
    body_bytes_sent UInt64,
    request_time Float32,
    upstream_response_time Nullable(Float32),
    user_agent String,
    referer String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (instance_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- URL statistics materialized view (hourly aggregation)
CREATE MATERIALIZED VIEW IF NOT EXISTS url_stats_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (instance_id, request_uri, hour)
AS SELECT
    instance_id,
    request_uri,
    toStartOfHour(timestamp) as hour,
    count() as request_count,
    countIf(status >= 500) as errors_5xx,
    countIf(status >= 400 AND status < 500) as errors_4xx,
    countIf(status >= 300 AND status < 400) as redirects_3xx,
    countIf(status >= 200 AND status < 300) as success_2xx,
    avg(request_time) as avg_latency,
    quantile(0.50)(request_time) as p50_latency,
    quantile(0.95)(request_time) as p95_latency,
    quantile(0.99)(request_time) as p99_latency,
    max(request_time) as max_latency,
    sum(body_bytes_sent) as total_bytes
FROM access_logs
GROUP BY instance_id, request_uri, hour;

-- HTTP status code distribution (hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS status_distribution_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (instance_id, status, hour)
AS SELECT
    instance_id,
    status,
    toStartOfHour(timestamp) as hour,
    count() as count
FROM access_logs
GROUP BY instance_id, status, hour;

-- Top URLs by traffic (daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS top_urls_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (instance_id, day, request_count)
AS SELECT
    instance_id,
    request_uri,
    toDate(timestamp) as day,
    count() as request_count,
    sum(body_bytes_sent) as total_bytes
FROM access_logs
GROUP BY instance_id, request_uri, day;

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    timestamp DateTime,
    instance_id String,
    level String,
    message String,
    client_addr Nullable(String),
    server Nullable(String),
    request Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (instance_id, timestamp)
TTL timestamp + INTERVAL 30 DAY;
