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
	drawMetricsFootnote(pdf)

	// Charts row: same Y for both section titles (was misaligned: pie used 95, bars used 102).
	chartY := 102.0
	pdf.SetY(chartY)
	drawTrafficPieChart(pdf, 15, chartY, report)
	drawEndpointsBarChart(pdf, 108, chartY, report.TopUris)

	// Performance Summary
	pdf.SetY(185)
	drawPerformanceSummary(pdf, report)

	// Executive visibility (summary, period-over-period, availability, alerts, top issues, recommendations)
	drawExecutiveVisibility(pdf, report)

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

	// Card 1: traffic volume — neutral semantic (high volume is not "healthy" by itself)
	drawMetricCard(pdf, 15, y, cardW, "REQUESTS", formatLargeNumber(summary.TotalRequests), 37, 99, 235, "neutral", "Volume, not health")

	// Card 2: Error rate (5xx share)
	errOK := summary.ErrorRate <= 1
	errColor := []int{34, 197, 94}
	if !errOK {
		errColor = []int{239, 68, 68}
	}
	toneErr := "attention"
	if errOK {
		toneErr = "ok"
	}
	drawMetricCard(pdf, 15+cardW+gap, y, cardW, "ERROR RATE", fmt.Sprintf("%.2f%%", summary.ErrorRate), errColor[0], errColor[1], errColor[2], toneErr, "5xx / all reqs")

	// Card 3: Latency vs target
	latOK := summary.AvgLatency <= 200
	latColor := []int{245, 158, 11}
	toneLat := "attention"
	if latOK {
		toneLat = "ok"
	}
	if summary.AvgLatency > 500 {
		latColor = []int{239, 68, 68}
		toneLat = "attention"
	}
	drawMetricCard(pdf, 15+(cardW+gap)*2, y, cardW, "AVG LATENCY", fmt.Sprintf("%.0fms", summary.AvgLatency), latColor[0], latColor[1], latColor[2], toneLat, "<=200ms target")

	// Card 4: composite health score
	healthScore := calculateHealth(summary)
	healthColor := []int{34, 197, 94}
	toneHealth := "ok"
	if healthScore < 80 {
		healthColor = []int{245, 158, 11}
		toneHealth = "attention"
	}
	if healthScore < 60 {
		healthColor = []int{239, 68, 68}
		toneHealth = "attention"
	}
	if healthScore >= 80 {
		toneHealth = "ok"
	}
	drawMetricCard(pdf, 15+(cardW+gap)*3, y, cardW, "HEALTH SCORE", fmt.Sprintf("%d%%", healthScore), healthColor[0], healthColor[1], healthColor[2], toneHealth, "Errors+latency")
}

// tone: ok | attention | neutral — footer is ASCII-only for reliable PDF fonts.
func drawMetricCard(pdf *gofpdf.Fpdf, x, y, w float64, label, value string, r, g, b int, tone, footer string) {
	h := 35.0

	pdf.SetFillColor(r, g, b)
	pdf.RoundedRect(x, y, w, h, 2, "1234", "F")

	pdf.SetFillColor(255, 255, 255)
	pdf.Circle(x+w-8, y+8, 4, "F")
	switch tone {
	case "ok":
		pdf.SetFillColor(34, 197, 94)
		pdf.Circle(x+w-8, y+8, 2.5, "F")
	case "attention":
		pdf.SetFillColor(239, 68, 68)
		pdf.Circle(x+w-8, y+8, 2.5, "F")
	default: // neutral
		pdf.SetFillColor(203, 213, 225)
		pdf.Circle(x+w-8, y+8, 2.5, "F")
	}

	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "", 7)
	pdf.SetXY(x+4, y+5)
	pdf.Cell(w-12, 4, label)

	pdf.SetFont("Arial", "B", 18)
	pdf.SetXY(x+4, y+14)
	pdf.Cell(w-8, 12, value)

	pdf.SetFont("Arial", "", 7)
	pdf.SetXY(x+4, y+27)
	pdf.Cell(w-8, 4, footer)
}

func drawMetricsFootnote(pdf *gofpdf.Fpdf) {
	pdf.SetFont("Arial", "", 7)
	pdf.SetTextColor(100, 116, 139)
	pdf.SetXY(15, 89)
	pdf.MultiCell(180, 3, "Error rate is the share of responses with HTTP 5xx. Health score penalizes high 5xx rates and high average latency (see card footers). Times in UTC.", "", "", false)
}

func drawTrafficPieChart(pdf *gofpdf.Fpdf, x, y float64, report *pb.ReportResponse) {
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x, y)
	pdf.Cell(88, 6, "TRAFFIC DISTRIBUTION")

	if report.Summary == nil {
		pdf.SetFont("Arial", "I", 9)
		pdf.SetTextColor(100, 116, 139)
		pdf.SetXY(x, y+14)
		pdf.Cell(80, 6, "No summary data")
		return
	}

	total := float64(report.Summary.TotalRequests)
	if total == 0 {
		total = 1
	}

	errors := float64(report.Summary.TotalRequests) * (float64(report.Summary.ErrorRate) / 100)
	success := float64(report.Summary.TotalRequests) - errors

	successPct := (success / total) * 100
	errorPct := (errors / total) * 100

	// Donut fits in left column; legend below (avoids collision with right column).
	centerX := x + 32
	centerY := y + 36
	radius := 22.0

	pdf.SetFillColor(34, 197, 94)
	drawPieSlice(pdf, centerX, centerY, radius, 0, successPct*3.6)

	pdf.SetFillColor(239, 68, 68)
	drawPieSlice(pdf, centerX, centerY, radius, successPct*3.6, 360)

	pdf.SetFillColor(255, 255, 255)
	pdf.Circle(centerX, centerY, radius*0.5, "F")

	pdf.SetFont("Arial", "B", 12)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(centerX-14, centerY-5)
	pdf.Cell(28, 5, fmt.Sprintf("%.1f%%", successPct))
	pdf.SetFont("Arial", "", 7)
	pdf.SetXY(centerX-14, centerY+1)
	pdf.Cell(28, 4, "Success")

	legendY := y + 62
	pdf.SetFont("Arial", "", 8)
	pdf.SetFillColor(34, 197, 94)
	pdf.Rect(x, legendY, 3.5, 3.5, "F")
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x+6, legendY-0.5)
	pdf.Cell(78, 4, fmt.Sprintf("Success %.1f%%", successPct))

	pdf.SetFillColor(239, 68, 68)
	pdf.Rect(x, legendY+6, 3.5, 3.5, "F")
	pdf.SetXY(x+6, legendY+5.5)
	pdf.Cell(78, 4, fmt.Sprintf("Errors %.1f%%", errorPct))
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
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetXY(x, y)
	pdf.Cell(82, 6, "TOP ENDPOINTS")

	if len(uris) == 0 {
		pdf.SetFont("Arial", "I", 9)
		pdf.SetTextColor(100, 116, 139)
		pdf.SetXY(x, y+14)
		pdf.Cell(80, 6, "No endpoint data available")
		return
	}

	maxReq := int64(1)
	for _, u := range uris {
		if u.Requests > maxReq {
			maxReq = u.Requests
		}
	}

	// Right column ~87mm wide (x=108 .. page edge 195); label + bar stacked per row.
	maxBarW := 72.0
	barH := 5.0
	rowY := y + 9.0
	colors := [][]int{
		{37, 99, 235},
		{59, 130, 246},
		{99, 102, 241},
		{139, 92, 246},
		{168, 85, 247},
	}

	count := len(uris)
	if count > 5 {
		count = 5
	}

	for i := 0; i < count; i++ {
		uri := uris[i]
		uriLabel := uri.Uri
		if len(uriLabel) > 52 {
			uriLabel = uriLabel[:49] + "..."
		}
		line := fmt.Sprintf("#%d  %s   %s", i+1, formatRequestCountForReport(uri.Requests), uriLabel)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(71, 85, 105)
		pdf.SetXY(x, rowY)
		pdf.Cell(82, 3.5, line)
		rowY += 4.0

		barW := (float64(uri.Requests) / float64(maxReq)) * maxBarW
		if barW < 1 {
			barW = 1
		}
		c := colors[i%len(colors)]
		pdf.SetFillColor(c[0], c[1], c[2])
		pdf.RoundedRect(x, rowY, barW, barH, 0.8, "1234", "F")
		rowY += barH + 3.5
	}
}

func drawPerformanceSummary(pdf *gofpdf.Fpdf, report *pb.ReportResponse) {
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.SetX(15)
	pdf.Cell(0, 6, "SERVER PERFORMANCE")
	pdf.Ln(5)
	pdf.SetFont("Arial", "", 8)
	pdf.SetTextColor(100, 116, 139)
	pdf.SetX(15)
	pdf.Cell(0, 4, "Top 5 agents by request volume (this period)")
	pdf.Ln(6)
	pdf.SetTextColor(30, 41, 59)

	if len(report.TopServers) == 0 {
		return
	}

	// Simple table
	
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
		pdf.CellFormat(30, 7, formatRequestCountForReport(srv.Requests), "B", 0, "C", false, 0, "")
		
		// Error rate with color
		if srv.ErrorRate > 1 {
			pdf.SetTextColor(239, 68, 68)
		} else {
			pdf.SetTextColor(34, 197, 94)
		}
		pdf.CellFormat(30, 7, fmt.Sprintf("%.2f%%", srv.ErrorRate), "B", 0, "C", false, 0, "")
		
		// Status indicator (ASCII for PDF portability)
		pdf.SetTextColor(30, 41, 59)
		status := "OK"
		if srv.ErrorRate > 1 {
			status = "Warning"
		}
		pdf.CellFormat(30, 7, status, "B", 0, "C", false, 0, "")
		pdf.Ln(-1)
	}
}

func drawExecutiveVisibility(pdf *gofpdf.Fpdf, report *pb.ReportResponse) {
	y := pdf.GetY() + 10
	if y > 240 {
		pdf.AddPage()
		y = 20
	}
	pdf.SetY(y)
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.Cell(0, 6, "EXECUTIVE VISIBILITY")
	pdf.Ln(8)

	pdf.SetFont("Arial", "", 9)
	pdf.SetTextColor(51, 65, 85)
	if report.ExecutiveSummary != "" {
		pdf.MultiCell(0, 5, report.ExecutiveSummary, "", "", false)
		pdf.Ln(3)
	}
	if report.PeriodOverPeriod != "" {
		pdf.SetFont("Arial", "B", 9)
		pdf.Cell(0, 5, "Period vs prior")
		pdf.Ln(4)
		pdf.SetFont("Arial", "", 9)
		pdf.MultiCell(0, 5, report.PeriodOverPeriod, "", "", false)
		pdf.Ln(2)
	}
	if report.AvailabilitySummary != "" {
		pdf.SetFont("Arial", "B", 9)
		pdf.Cell(0, 5, "Availability")
		pdf.Ln(4)
		pdf.SetFont("Arial", "", 9)
		pdf.MultiCell(0, 5, report.AvailabilitySummary, "", "", false)
		pdf.Ln(2)
	}
	if report.AlertsSummary != "" {
		pdf.SetFont("Arial", "B", 9)
		pdf.Cell(0, 5, "Alerts")
		pdf.Ln(4)
		pdf.SetFont("Arial", "", 9)
		pdf.MultiCell(0, 5, report.AlertsSummary, "", "", false)
		pdf.Ln(4)
	}
	if len(report.TopIssues) > 0 {
		pdf.SetFont("Arial", "B", 9)
		pdf.Cell(0, 5, "Top issues")
		pdf.Ln(5)
		pdf.SetFont("Arial", "", 8)
		for _, s := range report.TopIssues {
			pdf.SetX(18)
			pdf.MultiCell(0, 4, "- "+s, "", "", false)
		}
		pdf.Ln(3)
	}
	if len(report.Recommendations) > 0 {
		pdf.SetFont("Arial", "B", 9)
		pdf.Cell(0, 5, "Recommendations")
		pdf.Ln(5)
		pdf.SetFont("Arial", "", 8)
		for _, s := range report.Recommendations {
			pdf.SetX(18)
			pdf.MultiCell(0, 4, "- "+s, "", "", false)
		}
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
	pdf.CellFormat(0, 10, "Avika NGINX Manager - Executive Report (UTC)", "", 0, "L", false, 0, "")
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

// formatRequestCountForReport prefers extra precision so top endpoints do not all collapse to "1.0M".
func formatRequestCountForReport(n int64) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.2fM", float64(n)/1_000_000)
	}
	if n >= 100_000 {
		return fmt.Sprintf("%.1fK", float64(n)/1000)
	}
	if n >= 1000 {
		return fmt.Sprintf("%.2fK", float64(n)/1000)
	}
	return fmt.Sprintf("%d", n)
}
