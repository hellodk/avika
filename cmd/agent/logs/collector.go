package logs

import (
	"context"
	"log"
	"sync"

	pb "github.com/user/nginx-manager/api/proto"
)

type LogCollector struct {
	accessLogPath string
	errorLogPath  string
	accessTailer  *Tailer
	errorTailer   *Tailer

	exporter *OTLPExporter

	// Channels for distribution
	gatewayChan chan *pb.LogEntry

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewLogCollector(accessLog, errorLog, otlpEndpoint, agentID, hostname string) *LogCollector {
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

	return &LogCollector{
		accessLogPath: accessLog,
		errorLogPath:  errorLog,
		exporter:      exporter,
		gatewayChan:   make(chan *pb.LogEntry, 1000),
		ctx:           ctx,
		cancel:        cancel,
	}
}

func (c *LogCollector) Start() {
	// Start Access Log Tailer
	c.accessTailer = NewTailer(c.accessLogPath)
	accChan, err := c.accessTailer.Start()
	if err != nil {
		log.Printf("[ERROR] Failed to start access log tailer: %v", err)
	} else {
		c.wg.Add(1)
		go c.consume(accChan)
	}

	// Start Error Log Tailer
	c.errorTailer = NewTailer(c.errorLogPath)
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
				// Non-blocking send or separate goroutine recommended for production
				// For now, simple synchronous call (with timeout inside Export)
				go func(e *pb.LogEntry) {
					if err := c.exporter.Export(e); err != nil {
						// Suppress frequent errors or log occasionally
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
}

func (c *LogCollector) GetGatewayChannel() <-chan *pb.LogEntry {
	return c.gatewayChan
}
