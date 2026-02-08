"""
Log Aggregation Pipeline
Consumes parsed NGINX logs from Kafka and writes to ClickHouse
"""
from kafka import KafkaConsumer
from clickhouse_driver import Client
import orjson
import sys
from datetime import datetime

# ClickHouse client
ch_client = Client(
    host='clickhouse',
    port=9000,
    database='nginx_analytics'
)

def parse_log_entry(msg_bytes):
    """Parse log entry from Kafka"""
    try:
        data = orjson.loads(msg_bytes)
        return data
    except Exception as e:
        print(f"Parse error: {e}", file=sys.stderr, flush=True)
        return None

def insert_access_log(entry):
    """Insert access log into ClickHouse"""
    try:
        ch_client.execute(
            """
            INSERT INTO access_logs (
                timestamp, instance_id, remote_addr, request_method,
                request_uri, status, body_bytes_sent, request_time,
                user_agent, referer
            ) VALUES
            """,
            [(
                datetime.fromtimestamp(entry.get('timestamp', 0)),
                entry.get('instance_id', 'unknown'),
                entry.get('remote_addr', ''),
                entry.get('request_method', ''),
                entry.get('request_uri', ''),
                entry.get('status', 0),
                entry.get('body_bytes_sent', 0),
                entry.get('request_time', 0.0),
                entry.get('user_agent', ''),
                entry.get('referer', '')
            )]
        )
    except Exception as e:
        print(f"ClickHouse insert error: {e}", file=sys.stderr, flush=True)

def insert_error_log(entry):
    """Insert error log into ClickHouse"""
    try:
        ch_client.execute(
            """
            INSERT INTO error_logs (
                timestamp, instance_id, level, message
            ) VALUES
            """,
            [(
                datetime.fromtimestamp(entry.get('timestamp', 0)),
                entry.get('instance_id', 'unknown'),
                entry.get('level', 'error'),
                entry.get('content', '')
            )]
        )
    except Exception as e:
        print(f"ClickHouse insert error: {e}", file=sys.stderr, flush=True)

def main():
    print("Starting Log Aggregation Pipeline...", flush=True)
    print("Connecting to Redpanda...", flush=True)
    
    consumer = KafkaConsumer(
        'nginx-logs',
        bootstrap_servers=['redpanda:9092'],
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id='log-aggregator',
        value_deserializer=lambda m: m
    )
    
    print("Connected! Processing logs...", flush=True)
    
    for message in consumer:
        entry = parse_log_entry(message.value)
        if not entry:
            continue
        
        log_type = entry.get('log_type', 'access')
        
        if log_type == 'access':
            insert_access_log(entry)
        elif log_type == 'error':
            insert_error_log(entry)

if __name__ == "__main__":
    main()
