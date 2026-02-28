package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/smtp"
	"strings"

	"github.com/avika-ai/avika/cmd/gateway/config"
)

func SendReportEmail(cfg *config.Config, to []string, subject string, body string, attachment []byte, filename string) error {
	if cfg.SMTP.Host == "" {
		return fmt.Errorf("SMTP host not configured")
	}

	// Message construction
	boundary := "---NGINX_MANAGER_REPORT_BOUNDARY---"
	header := make(map[string]string)
	header["From"] = cfg.SMTP.From
	header["To"] = strings.Join(to, ",")
	header["Subject"] = subject
	header["MIME-Version"] = "1.0"
	header["Content-Type"] = "multipart/mixed; boundary=" + boundary

	var msg bytes.Buffer
	for k, v := range header {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")

	// Body
	msg.WriteString("--" + boundary + "\r\n")
	msg.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)
	msg.WriteString("\r\n")

	// Attachment
	if len(attachment) > 0 {
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString(fmt.Sprintf("Content-Type: application/pdf; name=\"%s\"\r\n", filename))
		msg.WriteString("Content-Transfer-Encoding: base64\r\n")
		msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n", filename))
		msg.WriteString("\r\n")

		b := make([]byte, base64.StdEncoding.EncodedLen(len(attachment)))
		base64.StdEncoding.Encode(b, attachment)
		msg.Write(b)
		msg.WriteString("\r\n")
	}
	msg.WriteString("--" + boundary + "--")

	// Auth
	var auth smtp.Auth
	if cfg.SMTP.Username != "" {
		auth = smtp.PlainAuth("", cfg.SMTP.Username, cfg.SMTP.Password, cfg.SMTP.Host)
	}

	addr := fmt.Sprintf("%s:%d", cfg.SMTP.Host, cfg.SMTP.Port)
	return smtp.SendMail(addr, auth, cfg.SMTP.From, to, msg.Bytes())
}
