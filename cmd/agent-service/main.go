package main

import (
	"context"
	"log"
	"net"

	pb "github.com/user/nginx-manager/api/proto"
	"github.com/user/nginx-manager/cmd/agent/certs"
	"github.com/user/nginx-manager/cmd/agent/config"
	"github.com/user/nginx-manager/cmd/agent/logs"
	"google.golang.org/grpc"
)

type agentServer struct {
	pb.UnimplementedAgentServiceServer
	configManager *config.Manager
	certManager   *certs.Manager
}

func newAgentServer() *agentServer {
	return &agentServer{
		configManager: config.NewManager("/etc/nginx/nginx.conf"),
		certManager:   certs.NewManager([]string{"/etc/nginx/ssl", "/etc/ssl/certs"}),
	}
}

// GetConfig returns the current NGINX configuration
func (s *agentServer) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
	parser := config.NewParser(req.ConfigPath)
	if req.ConfigPath == "" {
		parser = config.NewParser("/etc/nginx/nginx.conf")
	}

	nginxConfig, err := parser.Parse()
	if err != nil {
		return &pb.ConfigResponse{
			InstanceId: req.InstanceId,
			Error:      err.Error(),
		}, nil
	}

	return &pb.ConfigResponse{
		InstanceId: req.InstanceId,
		Config:     nginxConfig,
	}, nil
}

// UpdateConfig updates the NGINX configuration
func (s *agentServer) UpdateConfig(ctx context.Context, req *pb.ConfigUpdate) (*pb.ConfigUpdateResponse, error) {
	// Validate first
	parser := config.NewParser(req.ConfigPath)
	validation, err := parser.Validate(req.NewContent)
	if err != nil || !validation.Valid {
		errorMsg := "validation failed"
		if err != nil {
			errorMsg = err.Error()
		} else if len(validation.Errors) > 0 {
			errorMsg = validation.Errors[0]
		}
		return &pb.ConfigUpdateResponse{
			Success: false,
			Error:   errorMsg,
		}, nil
	}

	// Update config
	backupPath, err := s.configManager.Update(req.NewContent, req.Backup)
	if err != nil {
		return &pb.ConfigUpdateResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Reload NGINX
	if err := s.configManager.Reload(); err != nil {
		return &pb.ConfigUpdateResponse{
			Success:    false,
			Error:      "config updated but reload failed: " + err.Error(),
			BackupPath: backupPath,
		}, nil
	}

	return &pb.ConfigUpdateResponse{
		Success:    true,
		BackupPath: backupPath,
	}, nil
}

// ValidateConfig validates NGINX configuration syntax
func (s *agentServer) ValidateConfig(ctx context.Context, req *pb.ConfigValidation) (*pb.ValidationResult, error) {
	parser := config.NewParser("/etc/nginx/nginx.conf")
	result, err := parser.Validate(req.ConfigContent)
	if err != nil {
		return &pb.ValidationResult{
			Valid:  false,
			Errors: []string{err.Error()},
		}, nil
	}
	return result, nil
}

// ReloadNginx reloads NGINX configuration
func (s *agentServer) ReloadNginx(ctx context.Context, req *pb.ReloadRequest) (*pb.ReloadResponse, error) {
	if err := s.configManager.Reload(); err != nil {
		return &pb.ReloadResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &pb.ReloadResponse{Success: true}, nil
}

// ListCertificates returns all discovered SSL certificates
func (s *agentServer) ListCertificates(ctx context.Context, req *pb.CertListRequest) (*pb.CertListResponse, error) {
	certificates, err := s.certManager.Discover()
	if err != nil {
		return &pb.CertListResponse{Certificates: []*pb.Certificate{}}, nil
	}
	return &pb.CertListResponse{Certificates: certificates}, nil
}

// GetLogs streams log entries
func (s *agentServer) GetLogs(req *pb.LogRequest, stream pb.AgentService_GetLogsServer) error {
	logPath := "/var/log/nginx/access.log"
	if req.LogType == "error" {
		logPath = "/var/log/nginx/error.log"
	}

	if !req.Follow {
		// Return last N lines
		entries, err := logs.GetLastN(logPath, int(req.TailLines))
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := stream.Send(entry); err != nil {
				return err
			}
		}
		return nil
	}

	// Stream logs in real-time
	tailer := logs.NewTailer(logPath)
	entryChan, err := tailer.Start()
	if err != nil {
		return err
	}
	defer tailer.Stop()

	for entry := range entryChan {
		if err := stream.Send(entry); err != nil {
			return err
		}
	}

	return nil
}

func main() {
	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterAgentServiceServer(grpcServer, newAgentServer())

	log.Println("Agent Management Service listening on :50052")
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
