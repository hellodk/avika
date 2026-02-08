package logs

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/hpcloud/tail"
	pb "github.com/user/nginx-manager/api/proto"
)

type Parser struct {
	logFormat string
	regex     *regexp.Regexp
}

// NewParser creates a parser for NGINX access logs
// Supports the "combined" log format by default
func NewParser() *Parser {
	// NGINX combined log format regex
	// Example: 192.168.1.1 - - [07/Feb/2024:14:30:15 +0530] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
	pattern := `^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+) "([^"]*)" "([^"]*)"`

	return &Parser{
		logFormat: "combined",
		regex:     regexp.MustCompile(pattern),
	}
}

// ParseLine parses a single access log line
func (p *Parser) ParseLine(line string) (*pb.LogEntry, error) {
	matches := p.regex.FindStringSubmatch(line)
	if len(matches) < 9 {
		// Return unparsed entry
		return &pb.LogEntry{
			Timestamp: time.Now().Unix(),
			LogType:   "access",
			Content:   line,
		}, nil
	}

	// Parse timestamp
	timestamp, _ := time.Parse("02/Jan/2006:15:04:05 -0700", matches[2])

	// Parse status code
	status, _ := strconv.Atoi(matches[5])

	// Parse bytes sent
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
		RequestTime:   0, // Would need $request_time in log format
	}, nil
}

type Tailer struct {
	logPath string
	tail    *tail.Tail
}

func NewTailer(logPath string) *Tailer {
	return &Tailer{logPath: logPath}
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

	parser := NewParser()
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

	parser := NewParser()
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
