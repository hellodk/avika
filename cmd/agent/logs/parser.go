package logs

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/hpcloud/tail"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type Parser struct {
	logFormat string
	regex     *regexp.Regexp
}

type jsonLog struct {
	Ts       string  `json:"ts"`
	ReqID    string  `json:"req_id"`
	Client   string  `json:"client"`
	XFF      string  `json:"xff"` // X-Forwarded-For header for geo lookup
	Method   string  `json:"method"`
	Path     string  `json:"path"`
	Status   int32   `json:"status"`
	Bytes    int64   `json:"bytes"`
	Rt       float32 `json:"rt"`
	Uct      string  `json:"uct"`
	Uht      string  `json:"uht"`
	Urt      string  `json:"urt"`
	Upstream string  `json:"upstream"`
	Ustatus  string  `json:"ustatus"`
	Referer  string  `json:"referer"`
	UA       string  `json:"ua"`
}

// NewParser creates a parser for NGINX access logs
func NewParser(format string) *Parser {
	if format == "json" {
		return &Parser{logFormat: "json"}
	}

	// NGINX combined log format regex
	pattern := `^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+) "([^"]*)" "([^"]*)"`
	return &Parser{
		logFormat: "combined",
		regex:     regexp.MustCompile(pattern),
	}
}

// ParseLine parses a single access log line
func (p *Parser) ParseLine(line string) (*pb.LogEntry, error) {
	if p.logFormat == "json" || strings.HasPrefix(strings.TrimSpace(line), "{") {
		return p.parseJSON(line)
	}
	return p.parseCombined(line)
}

func (p *Parser) parseJSON(line string) (*pb.LogEntry, error) {
	var jl jsonLog
	if err := json.Unmarshal([]byte(line), &jl); err != nil {
		return &pb.LogEntry{
			Timestamp: time.Now().Unix(),
			LogType:   "access",
			Content:   line,
		}, nil
	}

	ts, _ := time.Parse(time.RFC3339, jl.Ts)
	if jl.Ts == "" {
		ts = time.Now()
	}

	// Helper to parse float from string (some NGINX vars can be "-")
	parseFloat := func(s string) float32 {
		if s == "-" || s == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(s, 32)
		return float32(f)
	}

	return &pb.LogEntry{
		Timestamp:            ts.Unix(),
		LogType:              "access",
		Content:              line,
		RemoteAddr:           jl.Client,
		RequestMethod:        jl.Method,
		RequestUri:           jl.Path,
		Status:               jl.Status,
		BodyBytesSent:        jl.Bytes,
		RequestTime:          jl.Rt,
		RequestId:            jl.ReqID,
		UpstreamAddr:         jl.Upstream,
		UpstreamStatus:       jl.Ustatus,
		UpstreamConnectTime:  parseFloat(jl.Uct),
		UpstreamHeaderTime:   parseFloat(jl.Uht),
		UpstreamResponseTime: parseFloat(jl.Urt),
		Referer:              jl.Referer,
		UserAgent:            jl.UA,
		XForwardedFor:        jl.XFF,
	}, nil
}

func (p *Parser) parseCombined(line string) (*pb.LogEntry, error) {
	matches := p.regex.FindStringSubmatch(line)
	if len(matches) < 9 {
		return &pb.LogEntry{
			Timestamp: time.Now().Unix(),
			LogType:   "access",
			Content:   line,
		}, nil
	}

	timestamp, _ := time.Parse("02/Jan/2006:15:04:05 -0700", matches[2])
	status, _ := strconv.Atoi(matches[5])
	bytesSent, _ := strconv.ParseInt(matches[6], 10, 64)

	return &pb.LogEntry{
		Timestamp:     timestamp.Unix(),
		LogType:       "access",
		Content:       line,
		RemoteAddr:    matches[1],
		RequestMethod: matches[3],
		RequestUri:    matches[4],
		Status:        int32(status),
		BodyBytesSent: bytesSent,
	}, nil
}

type Tailer struct {
	logPath   string
	logFormat string
	tail      *tail.Tail
}

func NewTailer(logPath, format string) *Tailer {
	return &Tailer{logPath: logPath, logFormat: format}
}

// Start begins tailing the log file
func (t *Tailer) Start() (<-chan *pb.LogEntry, error) {
	config := tail.Config{
		Follow: true,
		ReOpen: true,
		Location: &tail.SeekInfo{
			Offset: 0,
			Whence: 2, // Seek from end
		},
		Poll: true, // Force polling to avoid fsnotify issues
	}

	tailFile, err := tail.TailFile(t.logPath, config)
	if err != nil {
		return nil, fmt.Errorf("failed to tail file: %w", err)
	}

	t.tail = tailFile

	parser := NewParser(t.logFormat)
	entryChan := make(chan *pb.LogEntry, 100)

	go func() {
		defer close(entryChan)
		for line := range tailFile.Lines {
			if line.Err != nil {
				// log.Printf("Tail error: %v", line.Err)
				continue
			}

			// DEBUG:
			// fmt.Printf("Read line: %s\n", line.Text)

			entry, err := parser.ParseLine(line.Text)
			if err != nil {
				continue
			}

			entryChan <- entry
		}
	}()

	return entryChan, nil
}

// Stop stops tailing the log file
func (t *Tailer) Stop() error {
	if t.tail != nil {
		return t.tail.Stop()
	}
	return nil
}

// GetLastN reads the last N lines from the log file
func GetLastN(logPath string, n int) ([]*pb.LogEntry, error) {
	// Simple implementation - read file and get last N lines
	// In production, use more efficient tail implementation
	config := tail.Config{
		Follow:   false,
		Location: &tail.SeekInfo{Offset: -1024 * 10, Whence: 2}, // Last 10KB
	}

	tailFile, err := tail.TailFile(logPath, config)
	if err != nil {
		return nil, err
	}
	defer tailFile.Stop()

	// For GetLastN, we assume combined unless specified, or we could pass format.
	// Let's assume combined for now as it's a fallback/diagnostic tool.
	parser := NewParser("combined")
	entries := []*pb.LogEntry{}

	for line := range tailFile.Lines {
		if line.Err != nil {
			break
		}

		entry, err := parser.ParseLine(line.Text)
		if err != nil {
			continue
		}

		entries = append(entries, entry)
		if len(entries) >= n {
			break
		}
	}

	return entries, nil
}

// ParseErrorLog parses NGINX error log format
func ParseErrorLog(line string) *pb.LogEntry {
	// NGINX error log format: 2024/02/07 14:30:15 [error] 12345#0: *1 message
	parts := strings.SplitN(line, " ", 4)
	if len(parts) < 4 {
		return &pb.LogEntry{
			Timestamp: time.Now().Unix(),
			LogType:   "error",
			Content:   line,
		}
	}

	timestamp, _ := time.Parse("2006/01/02 15:04:05", parts[0]+" "+parts[1])

	return &pb.LogEntry{
		Timestamp: timestamp.Unix(),
		LogType:   "error",
		Content:   line,
	}
}
