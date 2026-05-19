package logs

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type LogCollector struct {
	accessLogPath string
	errorLogPath  string
	logFormat     string
	accessTailer  *Tailer
	errorTailer   *Tailer

	exporter         *OTLPExporter
	syslogForwarder  *LogSyslogForwarder

	// Channels for distribution
	gatewayChan chan *pb.LogEntry

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewLogCollector(accessLog, errorLog, logFormat, otlpEndpoint, agentID, hostname string, syslogCfg ...LogSyslogConfig) *LogCollector {
	ctx, cancel := context.WithCancel(context.Background())

	var exporter *OTLPExporter
	if otlpEndpoint != "" {
		exp, err := NewOTLPExporter(otlpEndpoint, agentID, hostname)
		if err != nil {
			log.Printf("[ERROR] Failed to create OTLP exporter: %v", err)
		} else {
			exporter = exp
		}
	}

	var syslog *LogSyslogForwarder
	if len(syslogCfg) > 0 && syslogCfg[0].Enabled {
		syslog = NewLogSyslogForwarder(syslogCfg[0])
		if syslog != nil {
			log.Printf("[INFO] Syslog forwarder enabled: %s", syslogCfg[0].TargetAddress)
		}
	}

	return &LogCollector{
		accessLogPath:   accessLog,
		errorLogPath:    errorLog,
		logFormat:       logFormat,
		exporter:        exporter,
		syslogForwarder: syslog,
		gatewayChan:     make(chan *pb.LogEntry, 1000),
		ctx:             ctx,
		cancel:          cancel,
	}
}

func (c *LogCollector) Start() {
	// Start Access Log Tailer
	c.accessTailer = NewTailer(c.accessLogPath, c.logFormat)
	accChan, err := c.accessTailer.Start()
	if err != nil {
		log.Printf("[ERROR] Failed to start access log tailer: %v", err)
	} else {
		c.wg.Add(1)
		go c.consume(accChan)
	}

	// Start Error Log Tailer
	c.errorTailer = NewTailer(c.errorLogPath, "combined") // Error logs are usually not the same JSON format
	errChan, err := c.errorTailer.Start()
	if err != nil {
		log.Printf("[ERROR] Failed to start error log tailer: %v", err)
	} else {
		c.wg.Add(1)
		go c.consume(errChan)
	}
}

func (c *LogCollector) consume(input <-chan *pb.LogEntry) {
	defer c.wg.Done()
	for {
		select {
		case entry, ok := <-input:
			if !ok {
				return
			}
			// Forward to Gateway
			select {
			case c.gatewayChan <- entry:
			default:
				// Drop if full to prevent blocking
			}

			// Forward to OTLP
			if c.exporter != nil {
				go func(e *pb.LogEntry) { _ = c.exporter.Export(e) }(entry)
			}

			// Forward to Syslog (SIEM fan-out)
			if c.syslogForwarder != nil {
				go func(e *pb.LogEntry) { _ = c.syslogForwarder.Forward(e) }(entry)
			}

		case <-c.ctx.Done():
			return
		}
	}
}

func (c *LogCollector) Stop() {
	c.cancel()
	if c.accessTailer != nil {
		_ = c.accessTailer.Stop()
	}
	if c.errorTailer != nil {
		_ = c.errorTailer.Stop()
	}
	c.wg.Wait()
	close(c.gatewayChan)

	if c.exporter != nil {
		c.exporter.Close()
	}
	if c.syslogForwarder != nil {
		c.syslogForwarder.Close()
	}
}

func (c *LogCollector) GetGatewayChannel() <-chan *pb.LogEntry {
	return c.gatewayChan
}

// LogSyslogForwarder sends log entries to a remote syslog server (UDP or TCP)
// using RFC 5424 message formatting with configurable facility and severity.
type LogSyslogForwarder struct {
	mu            sync.Mutex
	conn          net.Conn
	network       string // "udp" or "tcp"
	address       string // host:port
	facility      int
	severity      int
	reconnectWait time.Duration
	maxBackoff    time.Duration
	closed        bool
}

// LogSyslogConfig holds the parameters for creating a LogSyslogForwarder.
type LogSyslogConfig struct {
	Enabled       bool
	TargetAddress string // e.g. "udp://10.0.0.1:514"
	Facility      string // e.g. "local7"
	Severity      string // e.g. "info"
}

// NewLogSyslogForwarder creates a LogSyslogForwarder from the given config.
// Returns nil if the config is disabled or the target address is empty.
func NewLogSyslogForwarder(cfg LogSyslogConfig) *LogSyslogForwarder {
	if !cfg.Enabled || strings.TrimSpace(cfg.TargetAddress) == "" {
		return nil
	}

	network, address := parseSyslogAddress(cfg.TargetAddress)
	if address == "" {
		return nil
	}

	return &LogSyslogForwarder{
		network:       network,
		address:       address,
		facility:      parseFacility(cfg.Facility),
		severity:      parseSeverity(cfg.Severity),
		reconnectWait: 1 * time.Second,
		maxBackoff:    30 * time.Second,
	}
}

// Forward sends a log entry to the remote syslog server.
func (s *LogSyslogForwarder) Forward(entry *pb.LogEntry) error {
	if entry == nil {
		return nil
	}

	msg := s.formatRFC5424(entry)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return fmt.Errorf("syslog forwarder is closed")
	}

	// Lazy connect / reconnect
	if s.conn == nil {
		if err := s.connect(); err != nil {
			return err
		}
	}

	_, err := fmt.Fprint(s.conn, msg)
	if err != nil {
		// Connection broken — close and try once more
		s.conn.Close()
		s.conn = nil
		if err2 := s.connect(); err2 != nil {
			return fmt.Errorf("syslog reconnect failed: %w", err2)
		}
		_, err = fmt.Fprint(s.conn, msg)
	}
	return err
}

// Close shuts down the syslog connection.
func (s *LogSyslogForwarder) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}
}

// connect dials the syslog server with exponential backoff.
// Must be called with s.mu held.
func (s *LogSyslogForwarder) connect() error {
	var lastErr error
	wait := s.reconnectWait

	for attempts := 0; attempts < 3; attempts++ {
		conn, err := net.DialTimeout(s.network, s.address, 5*time.Second)
		if err == nil {
			s.conn = conn
			if attempts > 0 {
				log.Printf("[SYSLOG] Reconnected to %s://%s after %d attempts", s.network, s.address, attempts+1)
			}
			return nil
		}
		lastErr = err
		time.Sleep(wait)
		wait *= 2
		if wait > s.maxBackoff {
			wait = s.maxBackoff
		}
	}
	return fmt.Errorf("syslog connect to %s://%s failed after retries: %w", s.network, s.address, lastErr)
}

// formatRFC5424 formats a log entry as an RFC 5424 syslog message.
// Format: <PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID MSG
func (s *LogSyslogForwarder) formatRFC5424(entry *pb.LogEntry) string {
	pri := s.facility*8 + s.severity
	ts := time.Unix(entry.Timestamp, 0).UTC().Format(time.RFC3339)
	hostname := "-"
	appName := "nginx"
	procID := "-"
	msgID := entry.LogType
	if msgID == "" {
		msgID = "access"
	}
	msg := entry.Content
	if msg == "" {
		msg = fmt.Sprintf("%s %s %d %s", entry.RemoteAddr, entry.RequestUri, entry.Status, entry.RequestMethod)
	}

	return fmt.Sprintf("<%d>1 %s %s %s %s %s - %s\n", pri, ts, hostname, appName, procID, msgID, msg)
}

// parseSyslogAddress extracts network type and address from a syslog target string.
// Supports formats: "udp://host:port", "tcp://host:port", "host:port" (defaults to udp).
func parseSyslogAddress(target string) (network, address string) {
	target = strings.TrimSpace(target)
	if strings.HasPrefix(target, "tcp://") {
		return "tcp", strings.TrimPrefix(target, "tcp://")
	}
	if strings.HasPrefix(target, "udp://") {
		return "udp", strings.TrimPrefix(target, "udp://")
	}
	// Default to UDP if no scheme specified
	return "udp", target
}

// parseFacility converts a syslog facility name to its numeric code.
func parseFacility(name string) int {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "kern":
		return 0
	case "user":
		return 1
	case "mail":
		return 2
	case "daemon":
		return 3
	case "auth":
		return 4
	case "syslog":
		return 5
	case "lpr":
		return 6
	case "news":
		return 7
	case "local0":
		return 16
	case "local1":
		return 17
	case "local2":
		return 18
	case "local3":
		return 19
	case "local4":
		return 20
	case "local5":
		return 21
	case "local6":
		return 22
	case "local7":
		return 23
	default:
		return 23 // default to local7
	}
}

// parseSeverity converts a syslog severity name to its numeric code.
func parseSeverity(name string) int {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "emerg", "emergency":
		return 0
	case "alert":
		return 1
	case "crit", "critical":
		return 2
	case "err", "error":
		return 3
	case "warning", "warn":
		return 4
	case "notice":
		return 5
	case "info", "informational":
		return 6
	case "debug":
		return 7
	default:
		return 6 // default to info
	}
}
