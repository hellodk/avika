"""
Simple AI Anomaly Detection Engine
Consumes OTLP metrics and logs from Kafka and detects anomalies using River
"""
from kafka import KafkaConsumer, KafkaProducer
from river import anomaly
import orjson
import sys
from collections import defaultdict, deque
import time
import threading
import random

# Initialize anomaly detectors per metric
detectors = defaultdict(lambda: anomaly.HalfSpaceTrees(
    n_trees=10,
    height=8,
    window_size=200,
    seed=42
))

# Log buffer for RCA (Store last N logs)
LOG_BUFFER_SIZE = 1000
log_buffer = deque(maxlen=LOG_BUFFER_SIZE)

# Kafka Producer for Recommendations
producer = KafkaProducer(
    bootstrap_servers=['redpanda:9092'],
    value_serializer=lambda v: orjson.dumps(v)
)

def parse_otlp_metrics(msg_bytes):
    """Parse OTLP Metrics JSON and extract metrics"""
    try:
        data = orjson.loads(msg_bytes)
        results = []
        
        for rm in data.get("resourceMetrics", []):
            for sm in rm.get("scopeMetrics", []):
                for m in sm.get("metrics", []):
                    name = m.get("name", "")
                    
                    # Extract datapoints
                    dp_list = []
                    if "sum" in m:
                        dp_list = m["sum"].get("dataPoints", [])
                    elif "gauge" in m:
                        dp_list = m["gauge"].get("dataPoints", [])
                    
                    for dp in dp_list:
                        val = dp.get("asInt") or dp.get("asDouble") or 0
                        results.append((name, float(val)))
        
        return results
    except Exception as e:
        return []

def parse_otlp_logs(msg_bytes):
    """Parse OTLP Logs JSON and extract log records"""
    try:
        data = orjson.loads(msg_bytes)
        results = []
        
        for rl in data.get("resourceLogs", []):
            for sl in rl.get("scopeLogs", []):
                for lr in sl.get("logRecords", []):
                    body = lr.get("body", {}).get("stringValue", "")
                    if not body:
                        # try nested value
                         body = lr.get("body", {}).get("value", {}).get("stringValue", "")
                    
                    severity = lr.get("severityText", "INFO")
                    timestamp = int(lr.get("timeUnixNano", 0)) // 1_000_000_000
                    
                    results.append({
                        "timestamp": timestamp,
                        "severity": severity,
                        "message": body
                    })
        return results
    except Exception as e:
        return []

def generate_recommendation(metric_name, value):
    """Generate optimization recommendation based on anomaly"""
    rec_id = int(time.time() * 1000)
    
    if "request_time" in metric_name or "latency" in metric_name:
        return {
            "id": rec_id,
            "title": "Enable Micro-Caching",
            "description": f"High latency detected ({value}ms). Enable micro-caching to reduce upstream load.",
            "details": f"Latency spike of {value}ms observed. Micro-caching for 1s can significantly reduce backend pressure without affecting freshness.",
            "impact": "high",
            "category": "Performance",
            "confidence": 0.89,
            "estimated_improvement": "-40% latency",
            "current_config": "proxy_cache off;",
            "suggested_config": "proxy_cache_valid 200 1s;",
            "server": "nginx-prod-01",
            "timestamp": int(time.time())
        }
    elif "cpu" in metric_name:
         return {
            "id": rec_id,
            "title": "Optimize Worker Connections",
            "description": "High CPU usage detected. Tune worker_connections to handle concurrency better.",
            "details": "CPU saturation indicates thread contention. Increasing worker_connections provided we have enough file descriptors.",
            "impact": "medium",
            "category": "Performance",
            "confidence": 0.75,
            "estimated_improvement": "+20% throughput",
            "current_config": "worker_connections 1024;",
            "suggested_config": "worker_connections 4096;",
            "server": "nginx-prod-01",
            "timestamp": int(time.time())
        }
    
    return None

def perform_rca(metric_name, value):
    """Perform Root Cause Analysis by analyzing recent logs"""
    print(f"\n--- ROOT CAUSE ANALYSIS [Trigger: {metric_name} Anomaly ({value})] ---")
    
    # Simple RCA: Find recent error logs
    error_logs = [l for l in log_buffer if l["severity"] in ["ERROR", "FATAL"] or "error" in l["message"].lower()]
    
    if error_logs:
        print(f"Found {len(error_logs)} recent error logs associated with this anomaly:")
        # Show last 5 unique errors
        shown_errors = set()
        count = 0
        for log in reversed(error_logs):
            if log["message"] not in shown_errors:
                print(f"  [{log['severity']}] {log['message']}")
                shown_errors.add(log["message"])
                count += 1
                if count >= 5:
                    break
    
    # Generate Recommendation
    rec = generate_recommendation(metric_name, value)
    if rec:
        print(f"GENERATE RECOMMENDATION: {rec['title']}")
        producer.send('optimization-recommendations', rec)
        producer.flush()

    print("----------------------------------------------------------------\n", flush=True)

def process_message(message):
    topic = message.topic
    
    if topic == "telemetry-metrics":
        metrics = parse_otlp_metrics(message.value)
        for metric_name, value in metrics:
            # Model update & detection
            model = detectors[metric_name]
            score = model.score_one({"val": value})
            model.learn_one({"val": value})
            
            if score > 0.8:
                print(f"[ALERT] {metric_name}: {value} (Score: {score:.4f})", flush=True)
                perform_rca(metric_name, value)
            elif score > 0.5:
                print(f"[WARN] {metric_name}: {value} (Score: {score:.4f})", flush=True)
                
    elif topic == "telemetry-logs":
        logs = parse_otlp_logs(message.value)
        for log in logs:
            log_buffer.append(log)

def main():
    print("Starting AI Anomaly Detection & RCA Engine...", flush=True)
    print("Connecting to Redpanda (Topics: telemetry-metrics, telemetry-logs)...", flush=True)
    
    consumer = KafkaConsumer(
        'telemetry-metrics', 'telemetry-logs',
        bootstrap_servers=['redpanda:9092'],
        auto_offset_reset='latest', # Start from new data for real-time RCA
        enable_auto_commit=True,
        group_id='ai-engine-rca',
        value_deserializer=lambda m: m
    )
    
    print("Connected! Listening for telemetry...", flush=True)
    
    for message in consumer:
        process_message(message)

if __name__ == "__main__":
    main()
