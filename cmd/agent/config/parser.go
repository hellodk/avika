package config

import (
	"fmt"

	//	"github.com/tufanbarisyildirim/gonginx"
	//	"github.com/tufanbarisyildirim/gonginx/parser"
	pb "github.com/user/nginx-manager/api/proto"
)

type Parser struct {
	configPath string
}

func NewParser(configPath string) *Parser {
	return &Parser{configPath: configPath}
}

// Parse reads and parses the NGINX config file
func (p *Parser) Parse() (*pb.NginxConfig, error) {
	// disabled for now due to dependency issues
	return nil, fmt.Errorf("config parsing disabled")

	/*
		content, err := ioutil.ReadFile(p.configPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read config: %w", err)
		}

		config, err := parser.NewStringParser(string(content)).Parse()
		if err != nil {
			return nil, fmt.Errorf("failed to parse config: %w", err)
		}

		info, _ := os.Stat(p.configPath)
		var lastModified int64
		if info != nil {
			lastModified = info.ModTime().Unix()
		}

		nginxConfig := &pb.NginxConfig{
			ConfigPath:   p.configPath,
			Content:      string(content),
			LastModified: lastModified,
			Servers:      []*pb.ServerBlock{},
			Upstreams:    []*pb.UpstreamBlock{},
		}

		// Extract server blocks
		for _, directive := range config.GetDirectives() {
			if block, ok := directive.(*gonginx.Directive); ok {
				switch block.GetName() {
				case "server":
					serverBlock := p.parseServerBlock(block)
					if serverBlock != nil {
						nginxConfig.Servers = append(nginxConfig.Servers, serverBlock)
					}
				case "upstream":
					upstreamBlock := p.parseUpstreamBlock(block)
					if upstreamBlock != nil {
						nginxConfig.Upstreams = append(nginxConfig.Upstreams, upstreamBlock)
					}
				}
			}
		}

		return nginxConfig, nil
	*/
}

/*
func (p *Parser) parseServerBlock(block *gonginx.Directive) *pb.ServerBlock {
	server := &pb.ServerBlock{
		Listen:     []string{},
		ServerName: []string{},
		Locations:  []*pb.LocationBlock{},
		SslConfig:  make(map[string]string),
		Directives: make(map[string]string),
	}

	if block.GetBlock() == nil {
		return nil
	}

	for _, dir := range block.GetBlock().GetDirectives() {
		if d, ok := dir.(*gonginx.Directive); ok {
			name := d.GetName()
			params := d.GetParameters()

			switch name {
			case "listen":
				if len(params) > 0 {
					server.Listen = append(server.Listen, params[0])
				}
			case "server_name":
				server.ServerName = append(server.ServerName, params...)
			case "root":
				if len(params) > 0 {
					server.Root = params[0]
				}
			case "ssl_certificate", "ssl_certificate_key", "ssl_protocols", "ssl_ciphers":
				if len(params) > 0 {
					server.SslConfig[name] = params[0]
				}
			case "location":
				loc := p.parseLocationBlock(d)
				if loc != nil {
					server.Locations = append(server.Locations, loc)
				}
			default:
				if len(params) > 0 {
					server.Directives[name] = params[0]
				}
			}
		}
	}

	return server
}

func (p *Parser) parseLocationBlock(block *gonginx.Directive) *pb.LocationBlock {
	params := block.GetParameters()
	if len(params) == 0 {
		return nil
	}

	location := &pb.LocationBlock{
		Path:       params[len(params)-1],
		MatchType:  "prefix",
		Directives: make(map[string]string),
	}

	// Determine match type
	if len(params) > 1 {
		switch params[0] {
		case "=":
			location.MatchType = "exact"
		case "~", "~*":
			location.MatchType = "regex"
		}
	}

	if block.GetBlock() == nil {
		return location
	}

	for _, dir := range block.GetBlock().GetDirectives() {
		if d, ok := dir.(*gonginx.Directive); ok {
			name := d.GetName()
			params := d.GetParameters()

			if name == "proxy_pass" && len(params) > 0 {
				location.ProxyPass = params[0]
			} else if len(params) > 0 {
				location.Directives[name] = params[0]
			}
		}
	}

	return location
}

func (p *Parser) parseUpstreamBlock(block *gonginx.Directive) *pb.UpstreamBlock {
	params := block.GetParameters()
	if len(params) == 0 {
		return nil
	}

	upstream := &pb.UpstreamBlock{
		Name:       params[0],
		Servers:    []string{},
		Directives: make(map[string]string),
	}

	if block.GetBlock() == nil {
		return upstream
	}

	for _, dir := range block.GetBlock().GetDirectives() {
		if d, ok := dir.(*gonginx.Directive); ok {
			name := d.GetName()
			params := d.GetParameters()

			if name == "server" && len(params) > 0 {
				upstream.Servers = append(upstream.Servers, params[0])
			} else if len(params) > 0 {
				upstream.Directives[name] = params[0]
			}
		}
	}

	return upstream
}

// Validate checks if the config syntax is valid
func (p *Parser) Validate(content string) (*pb.ValidationResult, error) {
	// Write to temp file
	tmpFile, err := ioutil.TempFile("", "nginx-*.conf")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write([]byte(content)); err != nil {
		return nil, err
	}
	tmpFile.Close()

	// Try to parse
	_, err = parser.NewStringParser(content).Parse()

	result := &pb.ValidationResult{
		Valid:    err == nil,
		Errors:   []string{},
		Warnings: []string{},
	}

	if err != nil {
		result.Errors = append(result.Errors, err.Error())
	}

	return result, nil
}
*/
