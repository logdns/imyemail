package app

import (
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCertificateAdminStatusAndDisabledIssue(t *testing.T) {
	a := newTestApp(t)
	server := httptest.NewServer(a.Router())
	defer server.Close()
	admin := &testClient{t: t, server: server}
	var login map[string]any
	if code := admin.do("POST", "/api/auth/login", map[string]string{"email": "admin@imyemail.local", "password": "ChangeMe123!"}, &login); code != http.StatusOK {
		t.Fatalf("login code=%d", code)
	}
	var status CertificateStatus
	if code := admin.do("GET", "/api/admin/certificates/status", nil, &status); code != http.StatusOK || status.Enabled || status.Status != "disabled" {
		t.Fatalf("status code=%d value=%+v", code, status)
	}
	var errorBody map[string]any
	if code := admin.do("POST", "/api/admin/certificates/issue", nil, &errorBody); code != http.StatusBadRequest {
		t.Fatalf("disabled issue code=%d body=%v", code, errorBody)
	}
}

func TestCertificateProviderValidation(t *testing.T) {
	cfg := Config{
		CertificateAutoEnabled:     true,
		CertificateProvider:        "letsencrypt",
		CertificateEmail:           "admin@example.com",
		CertificateRenewBeforeDays: 30,
		PublicHostname:             "mail.example.com",
	}
	if err := validateCertificateConfig(cfg); err != nil {
		t.Fatalf("Let's Encrypt config rejected: %v", err)
	}
	cfg.CertificateProvider = "zerossl"
	if err := validateCertificateConfig(cfg); err == nil {
		t.Fatal("ZeroSSL without EAB should be rejected")
	}
	cfg.CertificateEABKID = "kid"
	cfg.CertificateEABHMAC = "MDEyMzQ1Njc4OWFiY2RlZg"
	if err := validateCertificateConfig(cfg); err != nil {
		t.Fatalf("valid ZeroSSL EAB rejected: %v", err)
	}
	cfg.CertificateProvider = "gts"
	if got := normalizeCertificateProvider(cfg.CertificateProvider); got != certificateProviderGoogle {
		t.Fatalf("provider=%q", got)
	}
}

func TestCertificateRuntimeFailureDoesNotPersistSettings(t *testing.T) {
	a := newTestApp(t)
	invalidDirectory := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(invalidDirectory, []byte("occupied"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := a.configSnapshot()
	cfg.CertificateDir = invalidDirectory
	a.replaceConfig(cfg)

	server := httptest.NewServer(a.Router())
	defer server.Close()
	admin := &testClient{t: t, server: server}
	if code := admin.do("POST", "/api/auth/login", map[string]string{"email": "admin@imyemail.local", "password": "ChangeMe123!"}, nil); code != http.StatusOK {
		t.Fatalf("login code=%d", code)
	}
	var settings SystemSettings
	if code := admin.do("GET", "/api/admin/settings", nil, &settings); code != http.StatusOK {
		t.Fatalf("settings code=%d", code)
	}
	update := systemSettingsPayload(settings)
	update["certificateAutoEnabled"] = true
	update["certificateEmail"] = "admin@example.test"
	var response map[string]any
	if code := admin.do("POST", "/api/admin/settings", update, &response); code != http.StatusInternalServerError {
		t.Fatalf("update code=%d response=%v", code, response)
	}
	if a.configSnapshot().CertificateAutoEnabled {
		t.Fatal("failed certificate runtime must not change the active configuration")
	}
	var persisted int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM system_settings WHERE key='certificateAutoEnabled' AND value='true'`).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	if persisted != 0 {
		t.Fatal("failed certificate runtime must not persist the rejected configuration")
	}
}

func TestWriteTLSCertificateExportsValidatedPair(t *testing.T) {
	sourceCert, sourceKey := writeTestCertificateFiles(t, "mail.example.test")
	cert, err := tls.LoadX509KeyPair(sourceCert, sourceKey)
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	certFile := filepath.Join(directory, "fullchain.pem")
	keyFile := filepath.Join(directory, "privkey.pem")
	if err := writeTLSCertificate(certFile, keyFile, &cert, "mail.example.test"); err != nil {
		t.Fatal(err)
	}
	if _, err := tls.LoadX509KeyPair(certFile, keyFile); err != nil {
		t.Fatalf("exported key pair invalid: %v", err)
	}
	if mode := fileMode(t, keyFile); mode != 0o600 {
		t.Fatalf("key mode=%o", mode)
	}
	if mode := fileMode(t, certFile); mode != 0o644 {
		t.Fatalf("certificate mode=%o", mode)
	}
}

func TestMailScoreHelpers(t *testing.T) {
	for score, grade := range map[int]string{100: "A", 90: "A", 89: "B", 75: "C", 65: "D", 59: "F"} {
		if got := mailScoreGrade(score); got != grade {
			t.Fatalf("score %d grade=%s want=%s", score, got, grade)
		}
	}
	if isPublicMailIP(net.ParseIP("127.0.0.1")) || isPublicMailIP(net.ParseIP("10.0.0.1")) || isPublicMailIP(net.ParseIP("203.0.113.10")) || isPublicMailIP(net.ParseIP("2001:2::1")) || isPublicMailIP(net.ParseIP("3fff::1")) || !isPublicMailIP(net.ParseIP("8.8.8.8")) || !isPublicMailIP(net.ParseIP("2001:4860:4860::8888")) {
		t.Fatal("public IP classification failed")
	}
}

func fileMode(t *testing.T, path string) os.FileMode {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.Mode().Perm()
}
