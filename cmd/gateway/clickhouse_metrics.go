package main

import (
	"context"
	"time"

	pb "github.com/user/nginx-manager/internal/common/proto/agent"
)

// Add these methods to the ClickHouseDB struct

func (db *ClickHouseDB) InsertSystemMetrics(metrics *pb.SystemMetrics, agentID string) error {
	if metrics == nil {
		return nil
	}

	ctx := context.Background()
	ts := time.Now()

	err := db.conn.Exec(ctx, `
		INSERT INTO system_metrics (
			timestamp, instance_id, cpu_usage, memory_usage,
			memory_total, memory_used, network_rx_bytes, network_tx_bytes,
			network_rx_rate, network_tx_rate,
			cpu_user, cpu_system, cpu_iowait
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?,
			?, ?, ?
		)
	`,
		ts,
		agentID,
		metrics.CpuUsagePercent,
		metrics.MemoryUsagePercent,
		metrics.MemoryTotalBytes,
		metrics.MemoryUsedBytes,
		metrics.NetworkRxBytes,
		metrics.NetworkTxBytes,
		metrics.NetworkRxRate,
		metrics.NetworkTxRate,
		metrics.CpuUserPercent,
		metrics.CpuSystemPercent,
		metrics.CpuIowaitPercent,
	)

	return err
}

func (db *ClickHouseDB) InsertNginxMetrics(metrics *pb.NginxMetrics, agentID string) error {
	if metrics == nil {
		return nil
	}

	ctx := context.Background()
	ts := time.Now()

	err := db.conn.Exec(ctx, `
		INSERT INTO nginx_metrics (
			timestamp, instance_id, active_connections, accepted_connections,
			handled_connections, total_requests, reading, writing,
			waiting, requests_per_second
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?
		)
	`,
		ts,
		agentID,
		metrics.ActiveConnections,
		metrics.AcceptedConnections,
		metrics.HandledConnections,
		metrics.TotalRequests,
		metrics.Reading,
		metrics.Writing,
		metrics.Waiting,
		metrics.RequestsPerSecond,
	)

	return err
}
