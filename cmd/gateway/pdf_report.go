package main

import (
	"bytes"
	"fmt"
	"time"

	"github.com/jung-kurt/gofpdf/v2"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

func GeneratePDFReport(report *pb.ReportResponse, start, end time.Time) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(40, 10, "NGINX Manager - Performance Report")
	pdf.Ln(12)

	// Time Range
	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 10, fmt.Sprintf("Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04")))
	pdf.Ln(10)

	// Executive Summary
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(0, 10, "Executive Summary")
	pdf.Ln(8)

	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 10, fmt.Sprintf("Total Requests: %d", report.Summary.TotalRequests))
	pdf.Ln(6)
	pdf.Cell(0, 10, fmt.Sprintf("Error Rate: %.2f%%", report.Summary.ErrorRate))
	pdf.Ln(6)
	pdf.Cell(0, 10, fmt.Sprintf("Average Latency: %.2fms", report.Summary.AvgLatency))
	pdf.Ln(6)
	pdf.Cell(0, 10, fmt.Sprintf("Total Bandwidth: %s", formatBytes(int64(report.Summary.TotalBandwidth))))
	pdf.Ln(12)

	// Top URIs Table
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(0, 10, "Top URIs")
	pdf.Ln(8)

	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(100, 7, "URI", "1", 0, "L", false, 0, "")
	pdf.CellFormat(30, 7, "Requests", "1", 0, "C", false, 0, "")
	pdf.CellFormat(30, 7, "Errors", "1", 0, "C", false, 0, "")
	pdf.CellFormat(30, 7, "P95 Latency", "1", 0, "C", false, 0, "")
	pdf.Ln(-1)

	pdf.SetFont("Arial", "", 10)
	for _, uri := range report.TopUris {
		pdf.CellFormat(100, 6, uri.Uri, "1", 0, "L", false, 0, "")
		pdf.CellFormat(30, 6, fmt.Sprintf("%d", uri.Requests), "1", 0, "C", false, 0, "")
		pdf.CellFormat(30, 6, fmt.Sprintf("%d", uri.Errors), "1", 0, "C", false, 0, "")
		pdf.CellFormat(30, 6, fmt.Sprintf("%.2fms", uri.P95), "1", 0, "C", false, 0, "")
		pdf.Ln(-1)
	}
	pdf.Ln(10)

	// Top Servers Table
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(0, 10, "Top Servers")
	pdf.Ln(8)

	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(100, 7, "Hostname", "1", 0, "L", false, 0, "")
	pdf.CellFormat(30, 7, "Requests", "1", 0, "C", false, 0, "")
	pdf.CellFormat(30, 7, "Error Rate", "1", 0, "C", false, 0, "")
	pdf.CellFormat(30, 7, "Traffic", "1", 0, "C", false, 0, "")
	pdf.Ln(-1)

	pdf.SetFont("Arial", "", 10)
	for _, srv := range report.TopServers {
		pdf.CellFormat(100, 6, srv.Hostname, "1", 0, "L", false, 0, "")
		pdf.CellFormat(30, 6, fmt.Sprintf("%d", srv.Requests), "1", 0, "C", false, 0, "")
		pdf.CellFormat(30, 6, fmt.Sprintf("%.2f%%", srv.ErrorRate), "1", 0, "C", false, 0, "")
		pdf.CellFormat(30, 6, formatBytes(int64(srv.Traffic)), "1", 0, "C", false, 0, "")
		pdf.Ln(-1)
	}

	// Output to bytes
	var out bytes.Buffer
	err := pdf.Output(&out)
	if err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
