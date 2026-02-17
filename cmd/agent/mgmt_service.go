package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"strings"

	"github.com/avika-ai/avika/cmd/agent/certs"
	"github.com/avika-ai/avika/cmd/agent/config"
	"github.com/avika-ai/avika/cmd/agent/logs"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"github.com/creack/pty"
	"google.golang.org/grpc"
)

type mgmtServer struct {
	pb.UnimplementedAgentServiceServer
	configManager *config.Manager
	certManager   *certs.Manager
}

func newMgmtServer(configPath string) *mgmtServer {
	return &mgmtServer{
		configManager: config.NewManager(configPath),
		certManager:   certs.NewManager([]string{"/etc/nginx/ssl", "/etc/ssl/certs"}),
	}
}

func (s *mgmtServer) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
	parser := config.NewParser(req.ConfigPath)
	if req.ConfigPath == "" {
		// Try a few common paths
		if _, err := os.Stat("/etc/nginx/nginx.conf"); err == nil {
			parser = config.NewParser("/etc/nginx/nginx.conf")
		} else if _, err := os.Stat("/opt/bitnami/nginx/conf/nginx.conf"); err == nil {
			parser = config.NewParser("/opt/bitnami/nginx/conf/nginx.conf")
		} else {
			// Fallback to primary detected instance path if available
			parser = config.NewParser("/etc/nginx/nginx.conf")
		}
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
	logPath := *accessLogPath
	if req.LogType == "error" {
		logPath = *errorLogPath
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

	// 1. Apply Snippet
	backupPath, err := s.configManager.UpdateSnippet(req.Augment.Snippet, req.Augment.Context)
	if err != nil {
		return &pb.ApplyAugmentResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to update config: %v", err),
		}, nil
	}

	// 2. Reload NGINX
	if err := s.configManager.Reload(); err != nil {
		log.Printf("Reload failed, rolling back... Error: %v", err)

		// 3. Rollback on failure
		if rbErr := s.configManager.Rollback(); rbErr != nil {
			return &pb.ApplyAugmentResponse{
				Success: false,
				Error:   fmt.Sprintf("Reload failed: %v. Critical: Rollback also failed: %v", err, rbErr),
				Preview: req.Augment.Snippet,
			}, nil
		}

		return &pb.ApplyAugmentResponse{
			Success: false,
			Error:   fmt.Sprintf("Config invalid, rolled back. Error: %v", err),
			Preview: req.Augment.Snippet,
		}, nil
	}

	return &pb.ApplyAugmentResponse{
		Success: true,
		Preview: req.Augment.Snippet + " (Applied & Backup at " + backupPath + ")",
	}, nil
}

func (s *mgmtServer) Execute(stream pb.AgentService_ExecuteServer) error {
	var cmd *exec.Cmd
	var ptmx *os.File
	var done = make(chan struct{})

	log.Printf("New Execute session started")

	for {
		req, err := stream.Recv()
		if err == io.EOF {
			log.Printf("Execute session ended (EOF)")
			if ptmx != nil {
				ptmx.Close()
			}
			if cmd != nil && cmd.Process != nil {
				cmd.Process.Kill()
			}
			return nil
		}
		if err != nil {
			log.Printf("Execute session recv error: %v", err)
			if ptmx != nil {
				ptmx.Close()
			}
			if cmd != nil && cmd.Process != nil {
				cmd.Process.Kill()
			}
			return err
		}

		if cmd == nil {
			// Start process on first message with a PTY for interactive shell support
			shell := req.Command
			if shell == "" {
				// Use Lens-style shell fallback: try bash, then ash, then sh
				// This ensures compatibility with all container images (Alpine, Debian, etc.)
				shell = "/bin/sh -c '(bash || ash || sh)'"
			}
			log.Printf("Starting shell with PTY: %s for instance: %s", shell, req.InstanceId)
			
			// Parse command - if it contains spaces, use sh -c to execute
			var cmdArgs []string
			if strings.Contains(shell, " ") {
				cmdArgs = []string{"/bin/sh", "-c", shell}
			} else {
				cmdArgs = []string{shell}
			}
			
			cmd = exec.Command(cmdArgs[0], cmdArgs[1:]...)
			cmd.Env = append(os.Environ(), "TERM=xterm-256color")
			
			// Start with PTY
			var err error
			ptmx, err = pty.Start(cmd)
			if err != nil {
				log.Printf("Failed to start shell with PTY %s: %v", shell, err)
				return stream.Send(&pb.ExecResponse{Error: err.Error()})
			}

			log.Printf("Shell started with PTY, streaming output...")

			// Goroutine to stream PTY output back
			go func() {
				defer close(done)
				buf := make([]byte, 4096)
				for {
					n, err := ptmx.Read(buf)
					if n > 0 {
						if sendErr := stream.Send(&pb.ExecResponse{Output: buf[:n]}); sendErr != nil {
							log.Printf("Failed to send PTY output: %v", sendErr)
							return
						}
					}
					if err != nil {
						if err != io.EOF {
							log.Printf("PTY read error: %v", err)
						}
						return
					}
				}
			}()
		}

		// Write input to PTY
		if len(req.Input) > 0 && ptmx != nil {
			if _, err := ptmx.Write(req.Input); err != nil {
				log.Printf("PTY write error: %v", err)
			}
		}
	}
}

func startMgmtService(ctx context.Context, configPath string, port int) {
	addr := fmt.Sprintf(":%d", port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("Failed to listen on %s: %v", addr, err)
		return
	}

	grpcServer := grpc.NewServer()
	pb.RegisterAgentServiceServer(grpcServer, newMgmtServer(configPath))

	log.Printf("Agent Management Service listening on %s", addr)

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
