package main

import (
	"context"
	"fmt"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

func (s *server) GenerateReport(ctx context.Context, req *pb.ReportRequest) (*pb.ReportResponse, error) {
	// validate time range
	start := time.Unix(req.StartTime, 0)
	end := time.Unix(req.EndTime, 0)

	if req.StartTime == 0 {
		start = time.Now().Add(-24 * time.Hour)
	}
	if req.EndTime == 0 {
		end = time.Now()
	}

	if end.Before(start) {
		return nil, fmt.Errorf("end time must be after start time")
	}

	if s.clickhouse == nil {
		return nil, fmt.Errorf("clickhouse connection not available")
	}
	// delegate to ClickHouse
	return s.clickhouse.GetReportData(ctx, start, end, req.AgentIds)
}

func (s *server) SendReport(ctx context.Context, req *pb.SendReportRequest) (*pb.SendReportResponse, error) {
	report, err := s.GenerateReport(ctx, req.Request)
	if err != nil {
		return nil, err
	}

	start := time.Unix(req.Request.StartTime, 0)
	end := time.Unix(req.Request.EndTime, 0)
	pdfData, err := GeneratePDFReport(report, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}

	err = SendReportEmail(s.config, req.Recipients, req.Subject, req.Body, pdfData, "report.pdf")
	if err != nil {
		return nil, fmt.Errorf("failed to send email: %w", err)
	}

	return &pb.SendReportResponse{Success: true, Message: "Report sent successfully"}, nil
}

func (s *server) DownloadReport(ctx context.Context, req *pb.ReportRequest) (*pb.ReportDownloadResponse, error) {
	report, err := s.GenerateReport(ctx, req)
	if err != nil {
		return nil, err
	}

	start := time.Unix(req.StartTime, 0)
	end := time.Unix(req.EndTime, 0)
	pdfData, err := GeneratePDFReport(report, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}

	return &pb.ReportDownloadResponse{
		Content:     pdfData,
		FileName:    fmt.Sprintf("report-%d.pdf", time.Now().Unix()),
		ContentType: "application/pdf",
	}, nil
}
