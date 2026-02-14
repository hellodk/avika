// Package logging provides structured logging for nginx-manager components.
package logging

import (
	"io"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Config holds logging configuration.
type Config struct {
	Level      string // debug, info, warn, error
	Format     string // json, console
	Output     io.Writer
	TimeFormat string
	Service    string // service name for log context
	Version    string // version for log context
}

// DefaultConfig returns default logging configuration.
func DefaultConfig() *Config {
	return &Config{
		Level:      "info",
		Format:     "json",
		Output:     os.Stdout,
		TimeFormat: time.RFC3339,
		Service:    "nginx-manager",
	}
}

// Setup initializes the global logger with the given configuration.
func Setup(cfg *Config) zerolog.Logger {
	if cfg == nil {
		cfg = DefaultConfig()
	}

	// Set log level
	level := zerolog.InfoLevel
	switch cfg.Level {
	case "debug":
		level = zerolog.DebugLevel
	case "info":
		level = zerolog.InfoLevel
	case "warn":
		level = zerolog.WarnLevel
	case "error":
		level = zerolog.ErrorLevel
	}
	zerolog.SetGlobalLevel(level)

	// Set time format
	zerolog.TimeFieldFormat = cfg.TimeFormat

	// Set output
	output := cfg.Output
	if output == nil {
		output = os.Stdout
	}

	// Use console writer for human-readable output
	if cfg.Format == "console" {
		output = zerolog.ConsoleWriter{
			Out:        output,
			TimeFormat: time.Kitchen,
		}
	}

	// Create logger with context
	logger := zerolog.New(output).
		With().
		Timestamp().
		Str("service", cfg.Service).
		Logger()

	if cfg.Version != "" {
		logger = logger.With().Str("version", cfg.Version).Logger()
	}

	// Set global logger
	log.Logger = logger

	return logger
}

// NewLogger creates a new logger with the given context fields.
func NewLogger(service string) zerolog.Logger {
	return log.With().Str("component", service).Logger()
}

// WithRequest adds request context to a logger.
func WithRequest(logger zerolog.Logger, requestID, method, path string) zerolog.Logger {
	return logger.With().
		Str("request_id", requestID).
		Str("method", method).
		Str("path", path).
		Logger()
}

// WithAgent adds agent context to a logger.
func WithAgent(logger zerolog.Logger, agentID, hostname, ip string) zerolog.Logger {
	return logger.With().
		Str("agent_id", agentID).
		Str("hostname", hostname).
		Str("ip", ip).
		Logger()
}

// WithError adds error context to a logger.
func WithError(logger zerolog.Logger, err error) zerolog.Logger {
	return logger.With().Err(err).Logger()
}

// LogDuration logs the duration of an operation.
func LogDuration(logger zerolog.Logger, operation string, start time.Time) {
	logger.Info().
		Str("operation", operation).
		Dur("duration", time.Since(start)).
		Msg("operation completed")
}

// LogHTTPRequest logs an HTTP request.
func LogHTTPRequest(logger zerolog.Logger, method, path, remoteAddr string, status int, duration time.Duration, bytesWritten int64) {
	var event *zerolog.Event
	if status >= 500 {
		event = logger.Error()
	} else if status >= 400 {
		event = logger.Warn()
	} else {
		event = logger.Info()
	}

	event.
		Str("method", method).
		Str("path", path).
		Str("remote_addr", remoteAddr).
		Int("status", status).
		Dur("duration", duration).
		Int64("bytes", bytesWritten).
		Msg("http request")
}

// LogGRPCRequest logs a gRPC request.
func LogGRPCRequest(logger zerolog.Logger, method string, duration time.Duration, err error) {
	event := logger.Info()
	if err != nil {
		event = logger.Error().Err(err)
	}

	event.
		Str("grpc_method", method).
		Dur("duration", duration).
		Msg("grpc request")
}

// LogDatabaseQuery logs a database query.
func LogDatabaseQuery(logger zerolog.Logger, query string, duration time.Duration, rowsAffected int64, err error) {
	event := logger.Debug()
	if err != nil {
		event = logger.Error().Err(err)
	}

	// Truncate query for logging
	if len(query) > 200 {
		query = query[:200] + "..."
	}

	event.
		Str("query", query).
		Dur("duration", duration).
		Int64("rows_affected", rowsAffected).
		Msg("database query")
}

// LogAgentConnection logs agent connection events.
func LogAgentConnection(logger zerolog.Logger, agentID, hostname, ip, event string) {
	logger.Info().
		Str("agent_id", agentID).
		Str("hostname", hostname).
		Str("ip", ip).
		Str("event", event).
		Msg("agent connection")
}

// LogMetric logs a metric value.
func LogMetric(logger zerolog.Logger, name string, value float64, labels map[string]string) {
	event := logger.Debug().
		Str("metric", name).
		Float64("value", value)

	for k, v := range labels {
		event = event.Str(k, v)
	}

	event.Msg("metric recorded")
}
