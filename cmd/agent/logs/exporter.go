package logs

import (
	"context"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/user/nginx-manager/api/proto"
	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
)

type OTLPExporter struct {
	client   collogspb.LogsServiceClient
	conn     *grpc.ClientConn
	agentID  string
	hostname string
}

func NewOTLPExporter(endpoint string, agentID string, hostname string) (*OTLPExporter, error) {
	conn, err := grpc.Dial(endpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	client := collogspb.NewLogsServiceClient(conn)

	return &OTLPExporter{
		client:   client,
		conn:     conn,
		agentID:  agentID,
		hostname: hostname,
	}, nil
}

func (e *OTLPExporter) Export(entry *pb.LogEntry) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Convert LogEntry to OTLP LogRecord
	logRecord := &logspb.LogRecord{
		TimeUnixNano: uint64(entry.Timestamp) * 1_000_000_000,
		SeverityText: entry.LogType, // "access" or "error"
		Body:         &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: entry.Content}},
		Attributes: []*commonpb.KeyValue{
			{Key: "log.type", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: entry.LogType}}},
			{Key: "http.status_code", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_IntValue{IntValue: int64(entry.Status)}}},
			{Key: "http.request_method", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: entry.RequestMethod}}},
			{Key: "http.target", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: entry.RequestUri}}},
			{Key: "http.client_ip", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: entry.RemoteAddr}}},
		},
	}

	// Create ResourceLogs
	req := &collogspb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						{Key: "service.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "nginx-agent"}}},
						{Key: "service.instance.id", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: e.agentID}}},
						{Key: "host.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: e.hostname}}},
					},
				},
				ScopeLogs: []*logspb.ScopeLogs{
					{
						LogRecords: []*logspb.LogRecord{logRecord},
					},
				},
			},
		},
	}

	_, err := e.client.Export(ctx, req)
	return err
}

func (e *OTLPExporter) Close() {
	if e.conn != nil {
		e.conn.Close()
	}
}
