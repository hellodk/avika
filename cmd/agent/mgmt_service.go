package main

import (
	"context"
	"log"
	"net"

	"github.com/user/nginx-manager/cmd/agent/certs"
	"github.com/user/nginx-manager/cmd/agent/config"
	"github.com/user/nginx-manager/cmd/agent/logs"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"
	"google.golang.org/grpc"
)

type mgmtServer struct {
	pb.UnimplementedAgentServiceServer
	configManager *config.Manager
	certManager   *certs.Manager
}

func newMgmtServer() *mgmtServer {
	return &mgmtServer{
		configManager: config.NewManager("/etc/nginx/nginx.conf"),
		certManager:   certs.NewManager([]string{"/etc/nginx/ssl", "/etc/ssl/certs"}),
	}
}

func (s *mgmtServer) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
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

func (s *mgmtServer) UpdateConfig(ctx context.Context, req *pb.ConfigUpdate) (*pb.ConfigUpdateResponse, error) {
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

	backupPath, err := s.configManager.Update(req.NewContent, req.Backup)
	if err != nil {
		return &pb.ConfigUpdateResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

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

func (s *mgmtServer) ValidateConfig(ctx context.Context, req *pb.ConfigValidation) (*pb.ValidationResult, error) {
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

func (s *mgmtServer) ReloadNginx(ctx context.Context, req *pb.ReloadRequest) (*pb.ReloadResponse, error) {
	if err := s.configManager.Reload(); err != nil {
		return &pb.ReloadResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &pb.ReloadResponse{Success: true}, nil
}

func (s *mgmtServer) RestartNginx(ctx context.Context, req *pb.RestartRequest) (*pb.RestartResponse, error) {
	if err := s.configManager.Restart(); err != nil {
		return &pb.RestartResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &pb.RestartResponse{Success: true}, nil
}

func (s *mgmtServer) StopNginx(ctx context.Context, req *pb.StopRequest) (*pb.StopResponse, error) {
	if err := s.configManager.Stop(); err != nil {
		return &pb.StopResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &pb.StopResponse{Success: true}, nil
}

func (s *mgmtServer) ListCertificates(ctx context.Context, req *pb.CertListRequest) (*pb.CertListResponse, error) {
	certificates, err := s.certManager.Discover()
	if err != nil {
		return &pb.CertListResponse{Certificates: []*pb.Certificate{}}, nil
	}
	return &pb.CertListResponse{Certificates: certificates}, nil
}

func (s *mgmtServer) GetLogs(req *pb.LogRequest, stream pb.AgentService_GetLogsServer) error {
	logPath := "/var/log/nginx/access.log"
	if req.LogType == "error" {
		logPath = "/var/log/nginx/error.log"
	}

	if !req.Follow {
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

	tailer := logs.NewTailer(logPath, "combined")
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

func (s *mgmtServer) ApplyAugment(ctx context.Context, req *pb.ApplyAugmentRequest) (*pb.ApplyAugmentResponse, error) {
	if req.Augment == nil {
		return &pb.ApplyAugmentResponse{
			Success: false,
			Error:   "augment is required",
		}, nil
	}

	log.Printf("Applying augment: %s (context: %s)", req.Augment.Name, req.Augment.Context)

	// For now, just return the preview
	// In production, this would:
	// 1. Read current NGINX config
	// 2. Merge the augment snippet into appropriate context
	// 3. Validate the merged config
	// 4. Apply if valid

	preview := req.Augment.Snippet

	return &pb.ApplyAugmentResponse{
		Success: true,
		Preview: preview,
	}, nil
}

func startMgmtService(ctx context.Context) {
	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Printf("Failed to listen on :50052: %v", err)
		return
	}

	grpcServer := grpc.NewServer()
	pb.RegisterAgentServiceServer(grpcServer, newMgmtServer())

	log.Println("Agent Management Service listening on :50052")

	// Start server in goroutine
	go func() {
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("Management service error: %v", err)
		}
	}()

	// Wait for context cancellation
	<-ctx.Done()
	log.Println("Shutting down management service...")
	grpcServer.GracefulStop()
	log.Println("Management service stopped")
}
