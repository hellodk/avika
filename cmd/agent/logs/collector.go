package logs

import (
	"context"
	"log"
	"sync"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type LogCollector struct {
	accessLogPath string
	errorLogPath  string
	logFormat     string
	accessTailer  *Tailer
	errorTailer   *Tailer

	exporter         *OTLPExporter
	syslogForwarder  *SyslogForwarder

	// Channels for distribution
	gatewayChan chan *pb.LogEntry

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewLogCollector(accessLog, errorLog, logFormat, otlpEndpoint, agentID, hostname string, syslogCfg ...SyslogConfig) *LogCollector {
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

	var syslog *SyslogForwarder
	if len(syslogCfg) > 0 && syslogCfg[0].Enabled {
		syslog = NewSyslogForwarder(syslogCfg[0])
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
				go func(e *pb.LogEntry) {
					if err := c.exporter.Export(e); err != nil {
						// Suppress frequent errors
					}
				}(entry)
			}

			// Forward to Syslog (SIEM fan-out)
			if c.syslogForwarder != nil {
				go func(e *pb.LogEntry) {
					if err := c.syslogForwarder.Forward(e); err != nil {
						// Suppress frequent errors
					}
				}(entry)
			}

		case <-c.ctx.Done():
			return
		}
	}
}

func (c *LogCollector) Stop() {
	c.cancel()
	if c.accessTailer != nil {
		c.accessTailer.Stop()
	}
	if c.errorTailer != nil {
		c.errorTailer.Stop()
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
