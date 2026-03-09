package main

import (
	"bytes"
	"fmt"
	"time"

	"github.com/xuri/excelize/v2"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// GenerateExcelReport produces an xlsx file from report data (summary, traffic trend, top URIs, top servers).
func GenerateExcelReport(report *pb.ReportResponse, start, end time.Time) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	// Sheet1: Summary
	sheetSummary := "Summary"
	if f.GetSheetName(0) != sheetSummary {
		f.SetSheetName(f.GetSheetName(0), sheetSummary)
	}
	_ = f.SetCellValue(sheetSummary, "A1", "Avika Report — Executive Summary")
	_ = f.SetCellValue(sheetSummary, "A2", fmt.Sprintf("Period: %s — %s", start.Format("2006-01-02"), end.Format("2006-01-02")))
	_ = f.SetCellValue(sheetSummary, "A3", fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")))
	_ = f.SetCellValue(sheetSummary, "A5", "Metric")
	_ = f.SetCellValue(sheetSummary, "B5", "Value")
	if report.Summary != nil {
		row := 6
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Total Requests")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), report.Summary.TotalRequests)
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Error Rate (%)")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), fmt.Sprintf("%.2f", report.Summary.ErrorRate))
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Total Bandwidth (bytes)")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), report.Summary.TotalBandwidth)
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Avg Latency (ms)")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), fmt.Sprintf("%.2f", report.Summary.AvgLatency))
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Unique Visitors")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), report.Summary.UniqueVisitors)
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Peak RPS")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), fmt.Sprintf("%.2f", report.Summary.PeakRps))
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Prev Period Requests")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), report.Summary.PrevPeriodRequests)
		row++
		_ = f.SetCellValue(sheetSummary, "A"+fmt.Sprint(row), "Prev Period Error Rate (%)")
		_ = f.SetCellValue(sheetSummary, "B"+fmt.Sprint(row), fmt.Sprintf("%.2f", report.Summary.PrevPeriodErrorRate))
	}

	// Sheet: Executive Insights
	_, _ = f.NewSheet("Insights")
	_ = f.SetCellValue("Insights", "A1", "Executive Summary")
	_ = f.SetCellValue("Insights", "A2", report.ExecutiveSummary)
	_ = f.SetCellValue("Insights", "A4", "Period over period")
	_ = f.SetCellValue("Insights", "A5", report.PeriodOverPeriod)
	_ = f.SetCellValue("Insights", "A7", "Availability")
	_ = f.SetCellValue("Insights", "A8", report.AvailabilitySummary)
	_ = f.SetCellValue("Insights", "A10", "Alerts")
	_ = f.SetCellValue("Insights", "A11", report.AlertsSummary)
	_ = f.SetCellValue("Insights", "A13", "Top issues")
	for i, s := range report.TopIssues {
		_ = f.SetCellValue("Insights", "A"+fmt.Sprint(14+i), s)
	}
	rowRec := 14 + len(report.TopIssues) + 1
	_ = f.SetCellValue("Insights", "A"+fmt.Sprint(rowRec), "Recommendations")
	for i, s := range report.Recommendations {
		_ = f.SetCellValue("Insights", "A"+fmt.Sprint(rowRec+1+i), s)
	}

	// Sheet2: Traffic Trend
	_, _ = f.NewSheet("Traffic Trend")
	_ = f.SetCellValue("Traffic Trend", "A1", "Time")
	_ = f.SetCellValue("Traffic Trend", "B1", "Requests")
	_ = f.SetCellValue("Traffic Trend", "C1", "Errors")
	for i, pt := range report.TrafficTrend {
		row := i + 2
		_ = f.SetCellValue("Traffic Trend", "A"+fmt.Sprint(row), pt.GetTime())
		_ = f.SetCellValue("Traffic Trend", "B"+fmt.Sprint(row), pt.GetRequests())
		_ = f.SetCellValue("Traffic Trend", "C"+fmt.Sprint(row), pt.GetErrors())
	}

	// Sheet3: Top URIs
	_, _ = f.NewSheet("Top URIs")
	_ = f.SetCellValue("Top URIs", "A1", "URI")
	_ = f.SetCellValue("Top URIs", "B1", "Requests")
	_ = f.SetCellValue("Top URIs", "C1", "P95 (ms)")
	for i, u := range report.TopUris {
		row := i + 2
		_ = f.SetCellValue("Top URIs", "A"+fmt.Sprint(row), u.GetUri())
		_ = f.SetCellValue("Top URIs", "B"+fmt.Sprint(row), u.GetRequests())
		_ = f.SetCellValue("Top URIs", "C"+fmt.Sprint(row), fmt.Sprintf("%.2f", u.GetP95()))
	}

	// Sheet4: Top Servers
	_, _ = f.NewSheet("Top Servers")
	_ = f.SetCellValue("Top Servers", "A1", "Hostname")
	_ = f.SetCellValue("Top Servers", "B1", "Requests")
	_ = f.SetCellValue("Top Servers", "C1", "Error Rate (%)")
	_ = f.SetCellValue("Top Servers", "D1", "Traffic (bytes)")
	for i, s := range report.TopServers {
		row := i + 2
		_ = f.SetCellValue("Top Servers", "A"+fmt.Sprint(row), s.GetHostname())
		_ = f.SetCellValue("Top Servers", "B"+fmt.Sprint(row), s.GetRequests())
		_ = f.SetCellValue("Top Servers", "C"+fmt.Sprint(row), fmt.Sprintf("%.2f", s.GetErrorRate()))
		_ = f.SetCellValue("Top Servers", "D"+fmt.Sprint(row), s.GetTraffic())
	}

	f.SetActiveSheet(0) // default to Summary on open

	var buf bytes.Buffer
	if _, err := f.WriteTo(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
