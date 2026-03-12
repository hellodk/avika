package config

import (
	"fmt"
	"os"
	"os/exec"

	//	"github.com/tufanbarisyildirim/gonginx"
	//	"github.com/tufanbarisyildirim/gonginx/parser"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
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

// Validate checks if the config syntax is valid by writing to a temporary file and running nginx -t.
// Note: This is an approximation as it won't see included files unless they are absolute.
func (p *Parser) Validate(content string) (*pb.ValidationResult, error) {
	tmpFile, err := os.CreateTemp("", "nginx-test-*.conf")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write([]byte(content)); err != nil {
		return nil, err
	}
	tmpFile.Close()

	// Try to use nginx -t -c
	// Note: This may fail if the config has relative includes that don't exist in the temp dir.
	// We use -t to test configuration and -c to specify the config file.
	cmd := exec.Command("nginx", "-t", "-c", tmpFile.Name())
	output, err := cmd.CombinedOutput()
	
	outStr := string(output)
	if err != nil {
		return &pb.ValidationResult{
			Valid:  false,
			Errors: []string{outStr},
		}, nil
	}

	return &pb.ValidationResult{
		Valid:    true,
		Errors:   []string{},
		Warnings: []string{outStr},
	}, nil
}
