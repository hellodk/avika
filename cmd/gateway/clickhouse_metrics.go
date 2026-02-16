package main

import (
	"fmt"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type gatewayMetrics struct {
	gatewayID string
	metrics   *pb.GatewayMetricPoint
}

func (db *ClickHouseDB) InsertSystemMetrics(metrics *pb.SystemMetrics, agentID string) error {
	if metrics == nil {
		return nil
	}
	select {
	case db.sysChan <- sysBatchItem{entry: metrics, agentID: agentID}:
		return nil
	default:
		return fmt.Errorf("system metrics queue full")
	}
}

func (db *ClickHouseDB) InsertNginxMetrics(metrics *pb.NginxMetrics, agentID string) error {
	if metrics == nil {
		return nil
	}
	select {
	case db.nginxChan <- nginxBatchItem{entry: metrics, agentID: agentID}:
		return nil
	default:
		return fmt.Errorf("nginx metrics queue full")
	}
}

func (db *ClickHouseDB) InsertGatewayMetrics(gatewayID string, metrics *pb.GatewayMetricPoint) error {
	if metrics == nil {
		return nil
	}
	select {
	case db.gwChan <- gwBatchItem{metrics: &gatewayMetrics{gatewayID: gatewayID, metrics: metrics}}:
		return nil
	default:
		return fmt.Errorf("gateway metrics queue full")
	}
}
