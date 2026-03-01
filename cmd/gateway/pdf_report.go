package main

import (
	"bytes"
	"fmt"
	"math"
	"time"

	"github.com/jung-kurt/gofpdf/v2"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

func GeneratePDFReport(report *pb.ReportResponse, start, end time.Time) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// Header
	drawHeader(pdf, start, end)

	// Executive KPIs Row
	pdf.SetY(50)
	drawExecutiveKPIs(pdf, report.Summary)

	// Charts Row
	pdf.SetY(95)
	
	// Left: Traffic Distribution Pie Chart
	drawTrafficPieChart(pdf, 15, 95, report)
	
	// Right: Top Endpoints Bar Chart
	drawEndpointsBarChart(pdf, 110, 95, report.TopUris)

	// Performance Summary
	pdf.SetY(170)
	drawPerformanceSummary(pdf, report)

	// Footer
	drawFooter(pdf)

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func drawHeader(pdf *gofpdf.Fpdf, start, end time.Time) {
	// Blue header bar
	pdf.SetFillColor(37, 99, 235)
	pdf.Rect(0, 0, 210, 40, "F")

	// Logo/Title
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "B", 28)
	pdf.SetXY(15, 10)
	pdf.Cell(0, 12, "AVIKA")

	pdf.SetFont("Arial", "", 11)
	pdf.SetXY(15, 24)
	pdf.Cell(0, 6, "Executive Performance Report")

	// Date range on right
	pdf.SetFont("Arial", "", 9)
	pdf.SetXY(130, 12)
	pdf.Cell(0, 5, fmt.Sprintf("Period: %s - %s", start.Format("Jan 02"), end.Format("Jan 02, 2006")))
	pdf.SetXY(130, 20)
	pdf.Cell(0, 5, fmt.Sprintf("Generated: %s", time.Now().Format("Jan 02, 2006 15:04")))

	// Decorative line
	pdf.SetDrawColor(59, 130, 246)
	pdf.SetLineWidth(0.5)
	pdf.Line(15, 32, 195, 32)
}

func drawExecutiveKPIs(pdf *gofpdf.Fpdf, summary *pb.ReportSummary) {
	pdf.SetFont("Arial", "B", 11)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(15, 45)
	pdf.Cell(0, 6, "KEY METRICS AT A GLANCE")

	y := float64(52)
	cardW := 42.0
	gap := 5.0

	// Card 1: Total Requests
	drawMetricCard(pdf, 15, y, cardW, "REQUESTS", formatLargeNumber(summary.TotalRequests), 37, 99, 235, true)
	
	// Card 2: Error Rate with status
	errStatus := summary.ErrorRate <= 1
	errColor := []int{34, 197, 94}
	if !errStatus {
		errColor = []int{239, 68, 68}
	}
	drawMetricCard(pdf, 15+cardW+gap, y, cardW, "ERROR RATE", fmt.Sprintf("%.2f%%", summary.ErrorRate), errColor[0], errColor[1], errColor[2], errStatus)

	// Card 3: Latency
	latStatus := summary.AvgLatency <= 200
	latColor := []int{245, 158, 11}
	if summary.AvgLatency > 500 {
		latColor = []int{239, 68, 68}
	}
	drawMetricCard(pdf, 15+(cardW+gap)*2, y, cardW, "AVG LATENCY", fmt.Sprintf("%.0fms", summary.AvgLatency), latColor[0], latColor[1], latColor[2], latStatus)

	// Card 4: Uptime/Health Score
	healthScore := calculateHealth(summary)
	healthColor := []int{34, 197, 94}
	if healthScore < 80 {
		healthColor = []int{245, 158, 11}
	}
	if healthScore < 60 {
		healthColor = []int{239, 68, 68}
	}
	drawMetricCard(pdf, 15+(cardW+gap)*3, y, cardW, "HEALTH", fmt.Sprintf("%d%%", healthScore), healthColor[0], healthColor[1], healthColor[2], healthScore >= 80)
}

func drawMetricCard(pdf *gofpdf.Fpdf, x, y, w float64, label, value string, r, g, b int, isGood bool) {
	h := 35.0

	// Card background
	pdf.SetFillColor(r, g, b)
	pdf.RoundedRect(x, y, w, h, 2, "1234", "F")

	// Status indicator circle
	pdf.SetFillColor(255, 255, 255)
	if isGood {
		pdf.Circle(x+w-8, y+8, 4, "F")
		pdf.SetFillColor(34, 197, 94)
		pdf.Circle(x+w-8, y+8, 2.5, "F")
	} else {
		pdf.Circle(x+w-8, y+8, 4, "F")
		pdf.SetFillColor(239, 68, 68)
		pdf.Circle(x+w-8, y+8, 2.5, "F")
	}

	// Label
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "", 7)
	pdf.SetXY(x+4, y+5)
	pdf.Cell(w-12, 4, label)

	// Value
	pdf.SetFont("Arial", "B", 18)
	pdf.SetXY(x+4, y+14)
	pdf.Cell(w-8, 12, value)

	// Trend indicator
	pdf.SetFont("Arial", "", 8)
	pdf.SetXY(x+4, y+27)
	if isGood {
		pdf.Cell(w-8, 4, "● Normal")
	} else {
		pdf.Cell(w-8, 4, "● Attention")
	}
}

func drawTrafficPieChart(pdf *gofpdf.Fpdf, x, y float64, report *pb.ReportResponse) {
	// Section title
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x, y)
	pdf.Cell(90, 6, "TRAFFIC DISTRIBUTION")

	// Calculate distribution from URIs or use summary
	total := float64(report.Summary.TotalRequests)
	if total == 0 {
		total = 1
	}
	
	// Calculate distribution from summary data
	errors := float64(report.Summary.TotalRequests) * (float64(report.Summary.ErrorRate) / 100)
	success := float64(report.Summary.TotalRequests) - errors
	
	successPct := (success / total) * 100
	errorPct := (errors / total) * 100

	// Draw pie chart
	centerX := x + 35
	centerY := y + 45
	radius := 25.0

	// Success slice (green)
	pdf.SetFillColor(34, 197, 94)
	drawPieSlice(pdf, centerX, centerY, radius, 0, successPct*3.6)

	// Error slice (red)
	pdf.SetFillColor(239, 68, 68)
	drawPieSlice(pdf, centerX, centerY, radius, successPct*3.6, 360)

	// Center circle (donut effect)
	pdf.SetFillColor(255, 255, 255)
	pdf.Circle(centerX, centerY, radius*0.5, "F")

	// Center text
	pdf.SetFont("Arial", "B", 14)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(centerX-15, centerY-5)
	pdf.Cell(30, 6, fmt.Sprintf("%.1f%%", successPct))
	pdf.SetFont("Arial", "", 7)
	pdf.SetXY(centerX-15, centerY+2)
	pdf.Cell(30, 4, "Success")

	// Legend
	legendY := y + 10
	pdf.SetFont("Arial", "", 8)
	
	pdf.SetFillColor(34, 197, 94)
	pdf.Rect(x+70, legendY, 4, 4, "F")
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x+76, legendY)
	pdf.Cell(20, 4, fmt.Sprintf("Success %.1f%%", successPct))

	pdf.SetFillColor(239, 68, 68)
	pdf.Rect(x+70, legendY+8, 4, 4, "F")
	pdf.SetXY(x+76, legendY+8)
	pdf.Cell(20, 4, fmt.Sprintf("Errors %.1f%%", errorPct))
}

func drawPieSlice(pdf *gofpdf.Fpdf, cx, cy, r, startAngle, endAngle float64) {
	if endAngle-startAngle < 0.1 {
		return
	}
	
	// Convert to radians
	start := (startAngle - 90) * math.Pi / 180
	end := (endAngle - 90) * math.Pi / 180

	// Draw arc using polygon approximation
	points := []gofpdf.PointType{{X: cx, Y: cy}}
	steps := int((endAngle - startAngle) / 5)
	if steps < 2 {
		steps = 2
	}
	
	for i := 0; i <= steps; i++ {
		angle := start + (end-start)*float64(i)/float64(steps)
		x := cx + r*math.Cos(angle)
		y := cy + r*math.Sin(angle)
		points = append(points, gofpdf.PointType{X: x, Y: y})
	}
	
	pdf.Polygon(points, "F")
}

func drawEndpointsBarChart(pdf *gofpdf.Fpdf, x, y float64, uris []*pb.EndpointStat) {
	// Section title
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x, y)
	pdf.Cell(90, 6, "TOP ENDPOINTS")

	if len(uris) == 0 {
		pdf.SetFont("Arial", "I", 9)
		pdf.SetTextColor(100, 116, 139)
		pdf.SetXY(x, y+30)
		pdf.Cell(80, 6, "No endpoint data available")
		return
	}

	// Find max for scaling
	maxReq := int64(1)
	for _, u := range uris {
		if u.Requests > maxReq {
			maxReq = u.Requests
		}
	}

	barY := y + 10
	barHeight := 10.0
	maxBarWidth := 60.0
	colors := [][]int{
		{37, 99, 235},   // Blue
		{59, 130, 246},  // Light blue
		{99, 102, 241},  // Indigo
		{139, 92, 246},  // Violet
		{168, 85, 247},  // Purple
	}

	count := len(uris)
	if count > 5 {
		count = 5
	}

	for i := 0; i < count; i++ {
		uri := uris[i]
		barWidth := (float64(uri.Requests) / float64(maxReq)) * maxBarWidth

		// Bar
		c := colors[i%len(colors)]
		pdf.SetFillColor(c[0], c[1], c[2])
		pdf.RoundedRect(x, barY, barWidth, barHeight-2, 1, "1234", "F")

		// Rank number
		pdf.SetFont("Arial", "B", 8)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetXY(x+2, barY+1)
		pdf.Cell(8, 6, fmt.Sprintf("#%d", i+1))

		// Value on bar
		pdf.SetXY(x+barWidth-20, barY+1)
		if barWidth > 25 {
			pdf.Cell(18, 6, formatLargeNumber(uri.Requests))
		}

		// URI label (truncated)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(100, 116, 139)
		uriLabel := uri.Uri
		if len(uriLabel) > 30 {
			uriLabel = uriLabel[:27] + "..."
		}
		pdf.SetXY(x+maxBarWidth+5, barY+1)
		pdf.Cell(30, 6, uriLabel)

		barY += barHeight + 2
	}
}

func drawPerformanceSummary(pdf *gofpdf.Fpdf, report *pb.ReportResponse) {
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(15, 170)
	pdf.Cell(0, 6, "SERVER PERFORMANCE")

	if len(report.TopServers) == 0 {
		return
	}

	// Simple table
	pdf.SetY(178)
	
	// Header
	pdf.SetFillColor(241, 245, 249)
	pdf.SetFont("Arial", "B", 8)
	pdf.SetTextColor(71, 85, 105)
	pdf.SetX(15)
	pdf.CellFormat(60, 7, "Server", "B", 0, "L", true, 0, "")
	pdf.CellFormat(30, 7, "Requests", "B", 0, "C", true, 0, "")
	pdf.CellFormat(30, 7, "Error Rate", "B", 0, "C", true, 0, "")
	pdf.CellFormat(30, 7, "Status", "B", 0, "C", true, 0, "")
	pdf.Ln(-1)

	pdf.SetFont("Arial", "", 8)
	count := len(report.TopServers)
	if count > 5 {
		count = 5
	}

	for i := 0; i < count; i++ {
		srv := report.TopServers[i]
		pdf.SetX(15)
		pdf.SetTextColor(30, 41, 59)
		pdf.CellFormat(60, 7, srv.Hostname, "B", 0, "L", false, 0, "")
		pdf.CellFormat(30, 7, formatLargeNumber(srv.Requests), "B", 0, "C", false, 0, "")
		
		// Error rate with color
		if srv.ErrorRate > 1 {
			pdf.SetTextColor(239, 68, 68)
		} else {
			pdf.SetTextColor(34, 197, 94)
		}
		pdf.CellFormat(30, 7, fmt.Sprintf("%.2f%%", srv.ErrorRate), "B", 0, "C", false, 0, "")
		
		// Status indicator
		pdf.SetTextColor(30, 41, 59)
		status := "● Healthy"
		if srv.ErrorRate > 1 {
			status = "● Warning"
		}
		pdf.CellFormat(30, 7, status, "B", 0, "C", false, 0, "")
		pdf.Ln(-1)
	}
}

func drawFooter(pdf *gofpdf.Fpdf) {
	pdf.SetY(-25)
	
	// Separator line
	pdf.SetDrawColor(226, 232, 240)
	pdf.Line(15, pdf.GetY(), 195, pdf.GetY())

	pdf.SetY(-20)
	pdf.SetFont("Arial", "I", 8)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(0, 10, "Avika NGINX Manager - Executive Report", "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 10, fmt.Sprintf("Page %d", pdf.PageNo()), "", 0, "R", false, 0, "")
}

func calculateHealth(summary *pb.ReportSummary) int {
	score := 100
	
	// Deduct for error rate
	if summary.ErrorRate > 5 {
		score -= 40
	} else if summary.ErrorRate > 2 {
		score -= 25
	} else if summary.ErrorRate > 1 {
		score -= 10
	}

	// Deduct for latency
	if summary.AvgLatency > 1000 {
		score -= 30
	} else if summary.AvgLatency > 500 {
		score -= 20
	} else if summary.AvgLatency > 200 {
		score -= 10
	}

	if score < 0 {
		score = 0
	}
	return score
}

func formatLargeNumber(n int64) string {
	if n >= 1000000 {
		return fmt.Sprintf("%.1fM", float64(n)/1000000)
	}
	if n >= 1000 {
		return fmt.Sprintf("%.1fK", float64(n)/1000)
	}
	return fmt.Sprintf("%d", n)
}
