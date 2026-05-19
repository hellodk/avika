package main

import (
	"context"
	"fmt"
	"math"
	"strings"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// enrichReportInsights fills executive_summary, top_issues, recommendations, period_over_period, availability_summary, alerts_summary.
func (s *server) enrichReportInsights(ctx context.Context, report *pb.ReportResponse) {
	if report.Summary == nil {
		return
	}
	sum := report.Summary

	report.PeriodOverPeriod = formatPeriodOverPeriod(sum)

	// Availability
	if s.db != nil {
		total, online, err := s.db.GetAgentCounts()
		if err == nil {
			if total == 0 {
				report.AvailabilitySummary = "No agents registered."
			} else if online == total {
				report.AvailabilitySummary = fmt.Sprintf("All %d agents healthy.", total)
			} else {
				report.AvailabilitySummary = fmt.Sprintf("%d of %d agents online; %d offline.",
					online, total, total-online)
			}
		} else {
			report.AvailabilitySummary = "Availability data unavailable."
		}
		// Alerts
		rules, err := s.db.ListAlertRules()
		if err == nil {
			enabled := 0
			for _, r := range rules {
				if r.Enabled {
					enabled++
				}
			}
			if len(rules) == 0 {
				report.AlertsSummary = "No alert rules configured yet (proactive alerting not set up)."
			} else {
				report.AlertsSummary = fmt.Sprintf("%d alert rule(s) defined (%d enabled).", len(rules), enabled)
			}
		} else {
			report.AlertsSummary = "Alert rules data unavailable."
		}
	} else {
		report.AvailabilitySummary = "—"
		report.AlertsSummary = "—"
	}

	// Top issues (3–5 bullets)
	var issues []string
	if sum.ErrorRate > 1 {
		issues = append(issues, fmt.Sprintf("Error rate above 1%% (%.2f%%) — review failing endpoints.", sum.ErrorRate))
	}
	if len(report.TopUris) > 0 {
		top := report.TopUris[0]
		errPct := 0.0
		if top.Requests > 0 {
			errPct = float64(top.Errors) / float64(top.Requests) * 100
		}
		if errPct > 5 {
			issues = append(issues, fmt.Sprintf("Highest error URI: %s (%.0f%% errors).", truncate(top.Uri, 50), errPct))
		}
		if top.P95 > 500 {
			issues = append(issues, fmt.Sprintf("Slowest endpoint P95: %s (%.0f ms).", truncate(top.Uri, 50), top.P95))
		}
	}
	if len(report.TopServers) > 0 {
		for _, srv := range report.TopServers {
			if srv.ErrorRate > 10 {
				issues = append(issues, fmt.Sprintf("Server %s: %.1f%% error rate.", srv.Hostname, srv.ErrorRate))
				break
			}
		}
	}
	if sum.PeakRps > 0 {
		avgRps := float64(sum.TotalRequests) / (1.0) // we don't have duration in summary; skip or use "Peak load noted"
		_ = avgRps
	}
	report.TopIssues = issues
	if len(issues) == 0 {
		report.TopIssues = []string{"No critical issues identified."}
	}

	// Recommendations
	var recs []string
	if sum.ErrorRate > 2 {
		if len(report.TopUris) > 0 && strings.TrimSpace(report.TopUris[0].Uri) != "" {
			recs = append(recs, fmt.Sprintf("Triage errors on %s first (highest request volume).", truncate(report.TopUris[0].Uri, 56)))
		}
		recs = append(recs, "Review top error URIs and fix application or upstream issues.")
	}
	if sum.AvgLatency > 300 {
		recs = append(recs, "Investigate latency (caching, DB, or upstream).")
	}
	if strings.Contains(report.AvailabilitySummary, "offline") {
		recs = append(recs, "Check offline agents and network connectivity.")
	}
	report.Recommendations = recs
	if len(recs) == 0 {
		report.Recommendations = []string{"No actions required; continue monitoring."}
	}

	// Executive summary: short; trend/availability/alerts stay in their own lines below.
	health := "System healthy."
	if sum.ErrorRate > 5 {
		health = "System under stress; error rate elevated."
	} else if sum.ErrorRate > 2 {
		health = "System stable with elevated errors in some endpoints."
	}
	var parts []string
	parts = append(parts, health)
	if strings.Contains(report.AvailabilitySummary, "offline") || strings.Contains(report.AvailabilitySummary, "No agents") {
		parts = append(parts, report.AvailabilitySummary+".")
	}
	if len(report.TopIssues) > 0 && report.TopIssues[0] != "No critical issues identified." {
		parts = append(parts, "Primary issue: "+strings.TrimSuffix(report.TopIssues[0], ".")+".")
	}
	report.ExecutiveSummary = strings.Join(parts, " ")
}

func formatPeriodOverPeriod(sum *pb.ReportSummary) string {
	if sum.PrevPeriodRequests <= 0 {
		return "No prior-period request volume in this comparison window; request percent change is not shown."
	}
	prev := sum.PrevPeriodRequests
	cur := sum.TotalRequests
	reqPct := float64(cur-prev) / float64(prev) * 100
	absDelta := cur - prev

	var reqLine string
	switch {
	case prev < 500 && math.Abs(reqPct) > 200:
		reqLine = fmt.Sprintf("Requests went from %d to %d (%+d vs a small prior baseline; %% change omitted as misleading).",
			prev, cur, absDelta)
	case math.Abs(reqPct) > 500:
		reqLine = fmt.Sprintf("Request volume changed sharply vs prior (%d -> %d). Percent change omitted above 500%% (usually a tiny or empty prior window).",
			prev, cur)
	default:
		reqLine = fmt.Sprintf("Requests %+.1f%% vs prior period (%d -> %d).", reqPct, prev, cur)
	}

	dpp := sum.ErrorRate - sum.PrevPeriodErrorRate
	errLine := fmt.Sprintf("Error rate %+0.2f percentage points vs prior (now %.2f%%, was %.2f%%).",
		dpp, sum.ErrorRate, sum.PrevPeriodErrorRate)
	return reqLine + " " + errLine
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
