package main

import (
	"time"

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
		t := time.NewTimer(50 * time.Millisecond)
		defer t.Stop()
		select {
		case db.sysChan <- sysBatchItem{entry: metrics, agentID: agentID}:
			return nil
		case <-t.C:
			db.droppedSys.Add(1)
			return nil
		}
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
		t := time.NewTimer(50 * time.Millisecond)
		defer t.Stop()
		select {
		case db.nginxChan <- nginxBatchItem{entry: metrics, agentID: agentID}:
			return nil
		case <-t.C:
			db.droppedNginx.Add(1)
			return nil
		}
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
		t := time.NewTimer(50 * time.Millisecond)
		defer t.Stop()
		select {
		case db.gwChan <- gwBatchItem{metrics: &gatewayMetrics{gatewayID: gatewayID, metrics: metrics}}:
			return nil
		case <-t.C:
			db.droppedGw.Add(1)
			return nil
		}
	}
}
