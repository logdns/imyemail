package app

import (
	"context"
	"crypto"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"
)

const (
	certificateProviderLetsEncrypt = "letsencrypt"
	certificateProviderZeroSSL     = "zerossl"
	certificateProviderGoogle      = "google_trust_services"
	zeroSSLDirectoryURL            = "https://acme.zerossl.com/v2/DV90"
	googleTrustDirectoryURL        = "https://dv.acme-v02.api.pki.goog/directory"
)

type CertificateStatus struct {
	Enabled       bool       `json:"enabled"`
	Provider      string     `json:"provider"`
	Hostname      string     `json:"hostname"`
	Status        string     `json:"status"`
	Issuer        string     `json:"issuer,omitempty"`
	SerialNumber  string     `json:"serialNumber,omitempty"`
	NotBefore     *time.Time `json:"notBefore,omitempty"`
	NotAfter      *time.Time `json:"notAfter,omitempty"`
	DaysRemaining int        `json:"daysRemaining,omitempty"`
	LastAttemptAt *time.Time `json:"lastAttemptAt,omitempty"`
	LastSuccessAt *time.Time `json:"lastSuccessAt,omitempty"`
	LastError     string     `json:"lastError,omitempty"`
}

type certificateRuntime struct {
	hostname string
	manager  *autocert.Manager
	handler  http.Handler
	certFile string
	keyFile  string
}

type exportingCertificateCache struct {
	base     autocert.Cache
	hostname string
	certFile string
	keyFile  string
	app      *App
	runtime  *certificateRuntime
}

func (c *exportingCertificateCache) Get(ctx context.Context, key string) ([]byte, error) {
	return c.base.Get(ctx, key)
}

func (c *exportingCertificateCache) Put(ctx context.Context, key string, data []byte) error {
	if err := c.base.Put(ctx, key, data); err != nil {
		return err
	}
	if key != c.hostname && key != c.hostname+"+rsa" {
		return nil
	}
	if !c.app.certificateRuntimeActive(c.runtime) {
		return nil
	}
	cert, err := tls.X509KeyPair(data, data)
	if err != nil {
		return fmt.Errorf("parse ACME cache certificate: %w", err)
	}
	return writeTLSCertificate(c.certFile, c.keyFile, &cert, c.hostname)
}

func (c *exportingCertificateCache) Delete(ctx context.Context, key string) error {
	return c.base.Delete(ctx, key)
}

func normalizeCertificateProvider(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case certificateProviderZeroSSL:
		return certificateProviderZeroSSL
	case certificateProviderGoogle, "google", "gts":
		return certificateProviderGoogle
	default:
		return certificateProviderLetsEncrypt
	}
}

func certificateProviderSupported(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case certificateProviderLetsEncrypt, certificateProviderZeroSSL, certificateProviderGoogle, "google", "gts":
		return true
	default:
		return false
	}
}

func validateCertificateConfig(cfg Config) error {
	if !cfg.CertificateAutoEnabled {
		return nil
	}
	if !validCertificateHostname(cfg.PublicHostname) {
		return errors.New("自动证书要求有效的公网主机名")
	}
	email := strings.TrimSpace(cfg.CertificateEmail)
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return errors.New("自动证书要求有效的联系邮箱")
	}
	if cfg.CertificateRenewBeforeDays < 7 || cfg.CertificateRenewBeforeDays > 60 {
		return errors.New("证书提前续期天数必须在 7 到 60 之间")
	}
	provider := normalizeCertificateProvider(cfg.CertificateProvider)
	if provider != certificateProviderLetsEncrypt {
		if strings.TrimSpace(cfg.CertificateEABKID) == "" || strings.TrimSpace(cfg.CertificateEABHMAC) == "" {
			return errors.New("ZeroSSL 和 Google Trust Services 必须配置 EAB KID 与 HMAC Key")
		}
		if _, err := decodeEABKey(cfg.CertificateEABHMAC); err != nil {
			return err
		}
	}
	return nil
}

func validCertificateHostname(value string) bool {
	value = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), ".")
	if value == "" || len(value) > 253 || !strings.Contains(value, ".") {
		return false
	}
	for _, label := range strings.Split(value, ".") {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, char := range label {
			if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '-' {
				return false
			}
		}
	}
	return true
}

func certificateDirectoryURL(provider string) string {
	switch normalizeCertificateProvider(provider) {
	case certificateProviderZeroSSL:
		return zeroSSLDirectoryURL
	case certificateProviderGoogle:
		return googleTrustDirectoryURL
	default:
		return acme.LetsEncryptURL
	}
}

func decodeEABKey(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	for _, encoding := range []*base64.Encoding{base64.RawURLEncoding, base64.URLEncoding, base64.StdEncoding} {
		if decoded, err := encoding.DecodeString(value); err == nil && len(decoded) >= 16 {
			return decoded, nil
		}
	}
	return nil, errors.New("EAB HMAC Key 必须是有效的 Base64/Base64URL，解码后至少 16 字节")
}

func (a *App) configureCertificateRuntime() error {
	cfg := a.configSnapshot()
	runtime, status, err := a.buildCertificateRuntime(cfg)
	if err != nil {
		return err
	}
	a.installCertificateRuntime(runtime, status)
	return nil
}

func (a *App) buildCertificateRuntime(cfg Config) (*certificateRuntime, CertificateStatus, error) {
	status := certificateStatusFromFile(cfg)
	status.Enabled = cfg.CertificateAutoEnabled
	status.Provider = normalizeCertificateProvider(cfg.CertificateProvider)
	status.Hostname = cfg.PublicHostname
	if !cfg.CertificateAutoEnabled {
		status.Status = "disabled"
		return nil, status, nil
	}
	if err := validateCertificateConfig(cfg); err != nil {
		return nil, CertificateStatus{}, err
	}
	directory, err := filepath.Abs(cfg.CertificateDir)
	if err != nil {
		return nil, CertificateStatus{}, fmt.Errorf("resolve certificate directory: %w", err)
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, CertificateStatus{}, fmt.Errorf("create certificate directory: %w", err)
	}
	if metadata, err := os.Lstat(directory); err != nil || !metadata.IsDir() || metadata.Mode()&os.ModeSymlink != 0 {
		return nil, CertificateStatus{}, errors.New("证书目录必须是普通目录且不能是符号链接")
	}
	hostname := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(cfg.PublicHostname)), ".")
	provider := normalizeCertificateProvider(cfg.CertificateProvider)
	cacheDir := filepath.Join(directory, "acme-cache", provider)
	baseCache := autocert.DirCache(cacheDir)
	certFile := filepath.Join(directory, "fullchain.pem")
	keyFile := filepath.Join(directory, "privkey.pem")
	runtime := &certificateRuntime{hostname: hostname, certFile: certFile, keyFile: keyFile}
	cache := &exportingCertificateCache{base: baseCache, hostname: hostname, certFile: certFile, keyFile: keyFile, app: a, runtime: runtime}
	manager := &autocert.Manager{
		Prompt:      autocert.AcceptTOS,
		Cache:       cache,
		HostPolicy:  autocert.HostWhitelist(hostname),
		RenewBefore: time.Duration(cfg.CertificateRenewBeforeDays) * 24 * time.Hour,
		Client: &acme.Client{
			DirectoryURL: certificateDirectoryURL(provider),
			UserAgent:    "imyemail/" + strings.TrimPrefix(cfg.AppVersion, "v"),
			HTTPClient: &http.Client{
				Timeout: 30 * time.Second,
				CheckRedirect: func(request *http.Request, via []*http.Request) error {
					if len(via) >= 5 || request.URL.Scheme != "https" {
						return errors.New("ACME redirect rejected")
					}
					return nil
				},
			},
		},
		Email: cfg.CertificateEmail,
	}
	if provider != certificateProviderLetsEncrypt {
		key, err := decodeEABKey(cfg.CertificateEABHMAC)
		if err != nil {
			return nil, CertificateStatus{}, err
		}
		manager.ExternalAccountBinding = &acme.ExternalAccountBinding{KID: cfg.CertificateEABKID, Key: key}
	}
	runtime.manager = manager
	runtime.handler = manager.HTTPHandler(http.NotFoundHandler())
	if status.Status == "" || status.Status == "disabled" {
		status.Status = "idle"
	}
	return runtime, status, nil
}

func (a *App) installCertificateRuntime(runtime *certificateRuntime, status CertificateStatus) {
	a.certificateMu.Lock()
	a.certificateRuntime = runtime
	a.certificateStatus = status
	a.certificateMu.Unlock()
}

func (a *App) certificateRuntimeActive(runtime *certificateRuntime) bool {
	a.certificateMu.RLock()
	defer a.certificateMu.RUnlock()
	return runtime != nil && a.certificateRuntime == runtime
}

func (a *App) handleACMEChallenge() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.certificateMu.RLock()
		runtime := a.certificateRuntime
		a.certificateMu.RUnlock()
		if runtime == nil || runtime.handler == nil {
			http.NotFound(w, r)
			return
		}
		runtime.handler.ServeHTTP(w, r)
	})
}

func (a *App) handleCertificateStatus(w http.ResponseWriter, _ *http.Request) {
	a.certificateMu.RLock()
	status := a.certificateStatus
	a.certificateMu.RUnlock()
	live := certificateStatusFromFile(a.configSnapshot())
	if live.Status != "" {
		status.Issuer = live.Issuer
		status.SerialNumber = live.SerialNumber
		status.NotBefore = live.NotBefore
		status.NotAfter = live.NotAfter
		status.DaysRemaining = live.DaysRemaining
		if status.Status != "issuing" && status.Status != "error" && status.Status != "disabled" {
			status.Status = live.Status
		}
	}
	respondJSON(w, http.StatusOK, status)
}

func (a *App) handleCertificateIssue(w http.ResponseWriter, _ *http.Request) {
	a.certificateMu.RLock()
	enabled := a.certificateRuntime != nil && a.certificateStatus.Enabled
	status := a.certificateStatus
	a.certificateMu.RUnlock()
	if !enabled {
		badRequest(w, errors.New("请先启用并保存自动证书设置"))
		return
	}
	a.triggerCertificateIssue()
	respondJSON(w, http.StatusAccepted, status)
}

func (a *App) triggerCertificateIssue() {
	select {
	case a.certificateTrigger <- struct{}{}:
	default:
	}
}

func (a *App) certificateWorker(ctx context.Context) {
	if a.configSnapshot().CertificateAutoEnabled {
		a.triggerCertificateIssue()
	}
	ticker := time.NewTicker(12 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !a.runCertificateIssue(ctx) {
				return
			}
		case <-a.certificateTrigger:
			if !a.runCertificateIssue(ctx) {
				return
			}
		}
	}
}

func (a *App) runCertificateIssue(ctx context.Context) bool {
	done := make(chan struct{})
	go func() {
		defer close(done)
		a.issueOrRenewCertificate(ctx)
	}()
	select {
	case <-done:
		return true
	case <-ctx.Done():
		return false
	}
}

func (a *App) issueOrRenewCertificate(ctx context.Context) {
	a.certificateMu.Lock()
	runtime := a.certificateRuntime
	if runtime == nil || !a.certificateStatus.Enabled || a.certificateStatus.Status == "issuing" {
		a.certificateMu.Unlock()
		return
	}
	now := a.now().UTC()
	a.certificateStatus.Status = "issuing"
	a.certificateStatus.LastAttemptAt = &now
	a.certificateStatus.LastError = ""
	a.certificateMu.Unlock()

	cert, err := runtime.manager.GetCertificate(&tls.ClientHelloInfo{ServerName: runtime.hostname})
	if err == nil && a.certificateRuntimeActive(runtime) {
		err = writeTLSCertificate(runtime.certFile, runtime.keyFile, cert, runtime.hostname)
	} else if err == nil {
		return
	}
	completed := a.now().UTC()
	a.certificateMu.Lock()
	defer a.certificateMu.Unlock()
	if a.certificateRuntime != runtime {
		return
	}
	if err != nil {
		a.certificateStatus.Status = "error"
		a.certificateStatus.LastError = sanitizeCertificateError(err)
		a.log.Error("ACME certificate issue or renewal failed", "provider", a.certificateStatus.Provider, "hostname", a.certificateStatus.Hostname, "error", err)
		return
	}
	status := certificateStatusFromFile(a.configSnapshot())
	status.Enabled = true
	status.Provider = a.certificateStatus.Provider
	status.Hostname = a.certificateStatus.Hostname
	status.LastAttemptAt = a.certificateStatus.LastAttemptAt
	status.LastSuccessAt = &completed
	a.certificateStatus = status
	a.log.Info("ACME certificate is ready", "provider", status.Provider, "hostname", status.Hostname, "expires_at", status.NotAfter)
}

func certificateStatusFromFile(cfg Config) CertificateStatus {
	status := CertificateStatus{Enabled: cfg.CertificateAutoEnabled, Provider: normalizeCertificateProvider(cfg.CertificateProvider), Hostname: cfg.PublicHostname}
	certFile := strings.TrimSpace(cfg.TLSCertFile)
	if certFile == "" {
		certFile = filepath.Join(cfg.CertificateDir, "fullchain.pem")
	}
	contents, err := os.ReadFile(certFile)
	if err != nil {
		return status
	}
	block, rest := pem.Decode(contents)
	if block == nil || block.Type != "CERTIFICATE" {
		return status
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil || cert.VerifyHostname(cfg.PublicHostname) != nil {
		return status
	}
	intermediates := x509.NewCertPool()
	for len(rest) > 0 {
		var next *pem.Block
		next, rest = pem.Decode(rest)
		if next == nil {
			break
		}
		if next.Type == "CERTIFICATE" {
			if intermediate, parseErr := x509.ParseCertificate(next.Bytes); parseErr == nil {
				intermediates.AddCert(intermediate)
			}
		}
	}
	now := time.Now().UTC()
	status.Status = "untrusted"
	status.Issuer = cert.Issuer.String()
	status.SerialNumber = cert.SerialNumber.String()
	status.NotBefore = &cert.NotBefore
	status.NotAfter = &cert.NotAfter
	status.DaysRemaining = int(cert.NotAfter.Sub(now).Hours() / 24)
	if now.After(cert.NotAfter) {
		status.Status = "expired"
	} else if _, verifyErr := cert.Verify(x509.VerifyOptions{DNSName: cfg.PublicHostname, Intermediates: intermediates, CurrentTime: now}); verifyErr == nil {
		status.Status = "valid"
	}
	return status
}

func writeTLSCertificate(certFile, keyFile string, cert *tls.Certificate, hostname string) error {
	if cert == nil || len(cert.Certificate) == 0 {
		return errors.New("ACME 未返回证书")
	}
	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		return fmt.Errorf("parse issued certificate: %w", err)
	}
	if err := leaf.VerifyHostname(hostname); err != nil {
		return fmt.Errorf("issued certificate does not cover hostname: %w", err)
	}
	signer, ok := cert.PrivateKey.(crypto.Signer)
	if !ok {
		return errors.New("ACME 私钥类型无效")
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(signer)
	if err != nil {
		return fmt.Errorf("marshal certificate key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	var certPEM []byte
	for _, der := range cert.Certificate {
		certPEM = append(certPEM, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})...)
	}
	if _, err := tls.X509KeyPair(certPEM, keyPEM); err != nil {
		return fmt.Errorf("validate issued key pair: %w", err)
	}
	if err := atomicCertificateWrite(keyFile, keyPEM, 0o600); err != nil {
		return err
	}
	if err := atomicCertificateWrite(certFile, certPEM, 0o644); err != nil {
		return err
	}
	return nil
}

func atomicCertificateWrite(path string, contents []byte, mode os.FileMode) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	if metadata, err := os.Lstat(path); err == nil && metadata.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refuse to replace certificate symlink: %s", path)
	}
	file, err := os.CreateTemp(directory, ".certificate-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(mode); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(contents); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func sanitizeCertificateError(err error) string {
	message := strings.TrimSpace(err.Error())
	if len(message) > 500 {
		message = message[:500]
	}
	return message
}
