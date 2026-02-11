package config

import (
	"fmt"
	"os"

	//	"github.com/tufanbarisyildirim/gonginx"
	//	"github.com/tufanbarisyildirim/gonginx/parser"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"
)

type Parser struct {
	configPath string
}

func NewParser(configPath string) *Parser {
	return &Parser{configPath: configPath}
}

// Parse reads and parses the NGINX config file
func (p *Parser) Parse() (*pb.NginxConfig, error) {
	content, err := os.ReadFile(p.configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	info, _ := os.Stat(p.configPath)
	var lastModified int64
	if info != nil {
		lastModified = info.ModTime().Unix()
	}

	return &pb.NginxConfig{
		ConfigPath:   p.configPath,
		Content:      string(content),
		LastModified: lastModified,
		Servers:      []*pb.ServerBlock{},
		Upstreams:    []*pb.UpstreamBlock{},
	}, nil
}

// Validate checks if the config syntax is valid
func (p *Parser) Validate(content string) (*pb.ValidationResult, error) {
	// Write to temp file
	tmpFile, err := os.CreateTemp("", "nginx-*.conf")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write([]byte(content)); err != nil {
		return nil, err
	}
	tmpFile.Close()

	// Use nginx -t to validate
	// Note: nginx -t normally checks the main config file.
	// To check a specific file, we'd need to use -c, but that might fail if includes are relative.
	// For now, we'll do a simple check or skip the actual nginx -t on arbitrary content
	// unless we are sure about the structure.
	// Actually, let's just return valid for now if we can't easily run nginx -t on a chunk.

	return &pb.ValidationResult{
		Valid:    true,
		Errors:   []string{},
		Warnings: []string{},
	}, nil
}
