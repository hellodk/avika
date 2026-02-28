package certs

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type Manager struct {
	certDirs []string
}

func NewManager(certDirs []string) *Manager {
	return &Manager{certDirs: certDirs}
}

// Discover finds all SSL certificates in configured directories
func (m *Manager) Discover() ([]*pb.Certificate, error) {
	var certificates []*pb.Certificate

	for _, dir := range m.certDirs {
		certs, err := m.scanDirectory(dir)
		if err != nil {
			continue // Skip directories with errors
		}
		certificates = append(certificates, certs...)
	}

	return certificates, nil
}

func (m *Manager) scanDirectory(dir string) ([]*pb.Certificate, error) {
	var certificates []*pb.Certificate

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files with errors
		}

		if info.IsDir() {
			return nil
		}

		// Look for .crt, .pem, .cert files
		ext := filepath.Ext(path)
		if ext != ".crt" && ext != ".pem" && ext != ".cert" {
			return nil
		}

		cert, err := m.parseCertificate(path)
		if err != nil {
			return nil // Skip invalid certificates
		}

		certificates = append(certificates, cert)
		return nil
	})

	return certificates, err
}

func (m *Manager) parseCertificate(certPath string) (*pb.Certificate, error) {
	data, err := ioutil.ReadFile(certPath)
	if err != nil {
		return nil, err
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}

	// Find corresponding key file
	keyPath := m.findKeyFile(certPath)

	// Calculate days until expiry
	daysUntilExpiry := int32(time.Until(cert.NotAfter).Hours() / 24)

	// Extract SANs (Subject Alternative Names)
	sanDomains := []string{}
	for _, dns := range cert.DNSNames {
		sanDomains = append(sanDomains, dns)
	}

	domain := cert.Subject.CommonName
	if domain == "" && len(sanDomains) > 0 {
		domain = sanDomains[0]
	}

	return &pb.Certificate{
		Domain:          domain,
		CertPath:        certPath,
		KeyPath:         keyPath,
		ExpiryTimestamp: cert.NotAfter.Unix(),
		Issuer:          cert.Issuer.CommonName,
		SanDomains:      sanDomains,
		DaysUntilExpiry: daysUntilExpiry,
	}, nil
}

func (m *Manager) findKeyFile(certPath string) string {
	// Try common key file patterns
	base := certPath[:len(certPath)-len(filepath.Ext(certPath))]
	keyPatterns := []string{
		base + ".key",
		base + "-key.pem",
		base + ".pem", // Sometimes key is in same file
	}

	for _, pattern := range keyPatterns {
		if _, err := os.Stat(pattern); err == nil {
			return pattern
		}
	}

	return ""
}

// CheckExpiry returns certificates expiring within the specified days
func (m *Manager) CheckExpiry(certificates []*pb.Certificate, withinDays int32) []*pb.Certificate {
	var expiring []*pb.Certificate

	for _, cert := range certificates {
		if cert.DaysUntilExpiry <= withinDays && cert.DaysUntilExpiry >= 0 {
			expiring = append(expiring, cert)
		}
	}

	return expiring
}
