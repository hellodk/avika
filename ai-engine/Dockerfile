FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY log_aggregator.py .

# Default to anomaly detection, can override with docker-compose command
CMD ["python", "main.py"]
