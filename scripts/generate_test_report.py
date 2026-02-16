#!/usr/bin/env python3
"""
Avika NGINX Manager - Test Report Generator

This script generates HTML and PDF test reports from test results.

Usage:
    python3 generate_test_report.py [options]

Options:
    --output-dir DIR    Output directory for reports (default: test-reports)
    --pdf               Generate PDF report in addition to HTML
    --open              Open the report in browser after generation
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime
from pathlib import Path


class TestReportGenerator:
    def __init__(self, output_dir: str = "test-reports"):
        self.project_root = Path(__file__).parent.parent
        self.output_dir = self.project_root / output_dir
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.report_name = f"avika-test-report-{self.timestamp}"
        
        # Test results
        self.results = {
            "go_gateway": {"status": "unknown", "passed": 0, "failed": 0, "coverage": 0},
            "go_agent": {"status": "unknown", "passed": 0, "failed": 0, "coverage": 0},
            "go_common": {"status": "unknown", "passed": 0, "failed": 0, "coverage": 0},
            "go_integration": {"status": "unknown", "passed": 0, "failed": 0},
            "frontend_unit": {"status": "unknown", "passed": 0, "failed": 0, "coverage": 0},
            "e2e": {"status": "unknown", "passed": 0, "failed": 0},
        }

    def setup(self):
        """Create output directories."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "go").mkdir(exist_ok=True)
        (self.output_dir / "frontend").mkdir(exist_ok=True)
        (self.output_dir / "e2e").mkdir(exist_ok=True)
        (self.output_dir / "coverage").mkdir(exist_ok=True)

    def parse_go_test_output(self, component: str):
        """Parse Go test output file."""
        output_file = self.output_dir / "go" / f"{component}-output.txt"
        if not output_file.exists():
            return

        with open(output_file, "r") as f:
            content = f.read()

        passed = content.count("--- PASS:")
        failed = content.count("--- FAIL:")
        
        key = f"go_{component}"
        if key in self.results:
            self.results[key]["passed"] = passed
            self.results[key]["failed"] = failed
            self.results[key]["status"] = "pass" if failed == 0 else "fail"

    def parse_frontend_results(self):
        """Parse frontend test results."""
        results_file = self.output_dir / "frontend" / "results.json"
        if not results_file.exists():
            return

        try:
            with open(results_file, "r") as f:
                data = json.load(f)
            
            passed = data.get("numPassedTests", 0)
            failed = data.get("numFailedTests", 0)
            
            self.results["frontend_unit"]["passed"] = passed
            self.results["frontend_unit"]["failed"] = failed
            self.results["frontend_unit"]["status"] = "pass" if failed == 0 else "fail"
        except (json.JSONDecodeError, KeyError):
            pass

    def parse_e2e_results(self):
        """Parse E2E test results."""
        # Check for Playwright results
        e2e_output = self.output_dir / "e2e" / "output.txt"
        if not e2e_output.exists():
            return

        with open(e2e_output, "r") as f:
            content = f.read()

        # Simple parsing - look for passed/failed counts
        if "passed" in content.lower():
            self.results["e2e"]["status"] = "pass"
            self.results["e2e"]["passed"] = 1
        if "failed" in content.lower() and "0 failed" not in content.lower():
            self.results["e2e"]["status"] = "fail"
            self.results["e2e"]["failed"] = 1

    def parse_coverage(self, component: str):
        """Parse Go coverage file."""
        coverage_file = self.output_dir / "coverage" / f"{component}-coverage.out"
        if not coverage_file.exists():
            return 0

        try:
            result = subprocess.run(
                ["go", "tool", "cover", "-func", str(coverage_file)],
                capture_output=True,
                text=True
            )
            # Get last line which has total
            lines = result.stdout.strip().split("\n")
            if lines:
                last_line = lines[-1]
                # Format: total:  (statements)  XX.X%
                if "%" in last_line:
                    percentage = float(last_line.split()[-1].replace("%", ""))
                    return percentage
        except Exception:
            pass
        return 0

    def collect_results(self):
        """Collect all test results."""
        print("📊 Collecting test results...")
        
        # Parse Go test outputs
        for component in ["gateway", "agent", "common"]:
            self.parse_go_test_output(component)
            coverage = self.parse_coverage(component)
            self.results[f"go_{component}"]["coverage"] = coverage

        # Integration tests
        self.parse_go_test_output("integration")
        
        # Frontend
        self.parse_frontend_results()
        
        # E2E
        self.parse_e2e_results()

    def calculate_totals(self):
        """Calculate total passed/failed."""
        total_passed = 0
        total_failed = 0
        
        for key, result in self.results.items():
            if result["status"] != "unknown":
                total_passed += result.get("passed", 0)
                total_failed += result.get("failed", 0)
        
        return total_passed, total_failed

    def generate_html(self) -> str:
        """Generate HTML report."""
        total_passed, total_failed = self.calculate_totals()
        total_tests = total_passed + total_failed
        pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
        
        overall_status = "success" if total_failed == 0 else "failure"
        status_text = "PASSED" if total_failed == 0 else "FAILED"

        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Avika Test Report - {datetime.now().strftime("%Y-%m-%d")}</title>
    <style>
        :root {{
            --bg-primary: #0a0a0a;
            --bg-secondary: #171717;
            --bg-card: #1a1a1a;
            --text-primary: #ffffff;
            --text-secondary: #a3a3a3;
            --accent-blue: #3b82f6;
            --accent-green: #22c55e;
            --accent-red: #ef4444;
            --accent-yellow: #eab308;
            --border-color: #262626;
        }}
        
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 2rem;
        }}
        
        .container {{ max-width: 1200px; margin: 0 auto; }}
        
        header {{
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }}
        
        .logo {{
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(90deg, var(--accent-blue), #06b6d4, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }}
        
        .subtitle {{ color: var(--text-secondary); font-size: 1.1rem; }}
        .timestamp {{ color: var(--text-secondary); font-size: 0.9rem; margin-top: 1rem; }}
        
        .status-banner {{
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 2rem;
            font-size: 1.5rem;
            font-weight: 600;
        }}
        
        .status-banner.success {{
            background: rgba(34, 197, 94, 0.1);
            border: 2px solid var(--accent-green);
            color: var(--accent-green);
        }}
        
        .status-banner.failure {{
            background: rgba(239, 68, 68, 0.1);
            border: 2px solid var(--accent-red);
            color: var(--accent-red);
        }}
        
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }}
        
        .stat-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
        }}
        
        .stat-value {{ font-size: 2.5rem; font-weight: 700; }}
        .stat-value.green {{ color: var(--accent-green); }}
        .stat-value.red {{ color: var(--accent-red); }}
        .stat-value.blue {{ color: var(--accent-blue); }}
        .stat-value.yellow {{ color: var(--accent-yellow); }}
        .stat-label {{ color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem; }}
        
        .section {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 1.5rem;
            overflow: hidden;
        }}
        
        .section-header {{
            background: var(--bg-secondary);
            padding: 1rem 1.5rem;
            font-weight: 600;
            border-bottom: 1px solid var(--border-color);
        }}
        
        .section-content {{ padding: 1.5rem; }}
        
        .test-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 0;
            border-bottom: 1px solid var(--border-color);
        }}
        
        .test-row:last-child {{ border-bottom: none; }}
        .test-name {{ font-weight: 500; }}
        
        .test-status {{
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 500;
        }}
        
        .test-status.pass {{ background: rgba(34, 197, 94, 0.1); color: var(--accent-green); }}
        .test-status.fail {{ background: rgba(239, 68, 68, 0.1); color: var(--accent-red); }}
        .test-status.skip {{ background: rgba(234, 179, 8, 0.1); color: var(--accent-yellow); }}
        
        .coverage {{ color: var(--text-secondary); font-size: 0.85rem; margin-left: 1rem; }}
        
        .progress-bar {{
            height: 8px;
            background: var(--bg-secondary);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 1rem;
        }}
        
        .progress-fill {{
            height: 100%;
            background: linear-gradient(90deg, var(--accent-green), var(--accent-blue));
        }}
        
        footer {{
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">Avika</div>
            <div class="subtitle">NGINX Manager - Test Report</div>
            <div class="timestamp">Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</div>
        </header>
        
        <div class="status-banner {overall_status}">
            Overall Status: {status_text}
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value blue">{total_tests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value green">{total_passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value red">{total_failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value yellow">{pass_rate:.0f}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Test Results by Category</div>
            <div class="section-content">
                {self._generate_test_rows()}
                <div class="progress-bar">
                    <div class="progress-fill" style="width: {pass_rate}%;"></div>
                </div>
            </div>
        </div>
        
        <footer>
            <p>Avika NGINX Manager &copy; 2026</p>
            <p>Report generated by generate_test_report.py</p>
        </footer>
    </div>
</body>
</html>'''

        return html

    def _generate_test_rows(self) -> str:
        """Generate HTML for test result rows."""
        rows = []
        
        test_names = {
            "go_gateway": "Go Unit Tests (Gateway)",
            "go_agent": "Go Unit Tests (Agent)",
            "go_common": "Go Unit Tests (Common)",
            "go_integration": "Go Integration Tests",
            "frontend_unit": "Frontend Unit Tests",
            "e2e": "E2E Tests",
        }
        
        for key, name in test_names.items():
            result = self.results[key]
            status = result["status"]
            status_class = "pass" if status == "pass" else ("fail" if status == "fail" else "skip")
            status_text = "PASSED" if status == "pass" else ("FAILED" if status == "fail" else "SKIPPED")
            
            coverage_html = ""
            if result.get("coverage", 0) > 0:
                coverage_html = f'<span class="coverage">({result["coverage"]:.1f}% coverage)</span>'
            
            rows.append(f'''
                <div class="test-row">
                    <span class="test-name">{name}{coverage_html}</span>
                    <span class="test-status {status_class}">{status_text}</span>
                </div>
            ''')
        
        return "\n".join(rows)

    def save_html(self):
        """Save HTML report."""
        html = self.generate_html()
        report_path = self.output_dir / f"{self.report_name}.html"
        
        with open(report_path, "w") as f:
            f.write(html)
        
        # Create latest symlink
        latest_path = self.output_dir / "latest.html"
        if latest_path.exists():
            latest_path.unlink()
        latest_path.symlink_to(report_path.name)
        
        print(f"✅ HTML report saved: {report_path}")
        return report_path

    def generate_pdf(self, html_path: Path):
        """Generate PDF from HTML."""
        pdf_path = self.output_dir / f"{self.report_name}.pdf"
        
        # Try different PDF generation methods
        methods = [
            (["wkhtmltopdf", "--enable-local-file-access", str(html_path), str(pdf_path)], "wkhtmltopdf"),
            (["chromium", "--headless", "--disable-gpu", f"--print-to-pdf={pdf_path}", str(html_path)], "chromium"),
            (["google-chrome", "--headless", "--disable-gpu", f"--print-to-pdf={pdf_path}", str(html_path)], "google-chrome"),
        ]
        
        for cmd, name in methods:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if result.returncode == 0 and pdf_path.exists():
                    print(f"✅ PDF report saved: {pdf_path}")
                    
                    # Create latest symlink
                    latest_path = self.output_dir / "latest.pdf"
                    if latest_path.exists():
                        latest_path.unlink()
                    latest_path.symlink_to(pdf_path.name)
                    
                    return pdf_path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
        
        print("⚠️  Could not generate PDF. Install wkhtmltopdf, chromium, or google-chrome.")
        return None

    def open_report(self, report_path: Path):
        """Open report in default browser."""
        import webbrowser
        webbrowser.open(f"file://{report_path}")
        print(f"📂 Opened report in browser")


def main():
    parser = argparse.ArgumentParser(description="Generate Avika test reports")
    parser.add_argument("--output-dir", default="test-reports", help="Output directory")
    parser.add_argument("--pdf", action="store_true", help="Generate PDF report")
    parser.add_argument("--open", action="store_true", help="Open report in browser")
    
    args = parser.parse_args()
    
    print("🧪 Avika Test Report Generator")
    print("=" * 50)
    
    generator = TestReportGenerator(args.output_dir)
    generator.setup()
    generator.collect_results()
    
    html_path = generator.save_html()
    
    if args.pdf:
        generator.generate_pdf(html_path)
    
    if args.open:
        generator.open_report(html_path)
    
    print("\n✨ Report generation complete!")


if __name__ == "__main__":
    main()
