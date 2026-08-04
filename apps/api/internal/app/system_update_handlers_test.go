package app

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestSystemVersionAndUpdate(t *testing.T) {
	releaseServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"tag_name":"v0.2.0","name":"Version 0.2.0","html_url":"https://example.test/releases/v0.2.0","body":"Release notes","published_at":"2026-08-03T00:00:00Z"}`)
	}))
	defer releaseServer.Close()

	var updateRequests atomic.Int32
	updateServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("update method = %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer update-secret" {
			t.Errorf("authorization = %q", got)
		}
		updateRequests.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer updateServer.Close()

	dir := t.TempDir()
	a := newTestAppWithConfig(t, Config{
		Addr:               ":0",
		AppVersion:         "v0.1.0",
		DBPath:             filepath.Join(dir, "imyemail.db"),
		DataDir:            dir,
		CookieName:         "imyemail_test",
		SessionTTLHours:    24,
		AdminEmail:         "admin@imyemail.local",
		AdminPassword:      "ChangeMe123!",
		PublicHostname:     "mail.example.test",
		PublicBaseURL:      "http://localhost:5173",
		AllowInsecureHTTP:  true,
		ReleaseAPIURL:      releaseServer.URL,
		UpdateServiceURL:   updateServer.URL,
		UpdateServiceToken: "update-secret",
	})
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	admin := &testClient{t: t, server: ts}
	if code := admin.do("POST", "/api/auth/login", map[string]string{"email": "admin@imyemail.local", "password": "ChangeMe123!"}, nil); code != http.StatusOK {
		t.Fatalf("login code=%d", code)
	}

	var version systemVersionInfo
	if code := admin.do("GET", "/api/admin/system/version", nil, &version); code != http.StatusOK {
		t.Fatalf("version code=%d", code)
	}
	if version.CurrentVersion != "v0.1.0" || version.LatestVersion != "v0.2.0" || !version.UpdateAvailable || !version.UpdateEnabled {
		t.Fatalf("unexpected version response: %+v", version)
	}

	var update map[string]any
	if code := admin.do("POST", "/api/admin/system/update", nil, &update); code != http.StatusAccepted {
		t.Fatalf("update code=%d response=%v", code, update)
	}
	if updateRequests.Load() != 1 {
		t.Fatalf("update requests=%d", updateRequests.Load())
	}
	backups, err := filepath.Glob(filepath.Join(dir, "backups", "pre-update-*.db"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("backups=%v err=%v", backups, err)
	}
	if info, err := os.Stat(backups[0]); err != nil || info.Size() == 0 {
		t.Fatalf("backup stat=%v err=%v", info, err)
	}
	if mode := fileMode(t, backups[0]); mode != 0o600 {
		t.Fatalf("backup mode=%o, want 600", mode)
	}
	if mode := fileMode(t, filepath.Join(dir, "backups")); mode != 0o700 {
		t.Fatalf("backup directory mode=%o, want 700", mode)
	}
}

func TestSystemUpdateRequiresSystemAdministrator(t *testing.T) {
	a := newTestApp(t)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/system/update", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, &User{ID: "operator", Role: "user"}))
	recorder := httptest.NewRecorder()
	a.handleSystemUpdate(recorder, req)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestSystemVersionHandlesReleaseFailure(t *testing.T) {
	dir := t.TempDir()
	a, err := New(Config{
		Addr:              ":0",
		AppVersion:        "v0.1.0",
		DBPath:            filepath.Join(dir, "imyemail.db"),
		DataDir:           dir,
		CookieName:        "imyemail_test",
		SessionTTLHours:   24,
		AdminEmail:        "admin@imyemail.local",
		AdminPassword:     "ChangeMe123!",
		PublicHostname:    "mail.example.test",
		PublicBaseURL:     "http://localhost:5173",
		ReleaseAPIURL:     "http://127.0.0.1:1/releases/latest",
		AllowInsecureHTTP: true,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/system/version", nil)
	recorder := httptest.NewRecorder()
	a.handleSystemVersion(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("code=%d", recorder.Code)
	}
	var info systemVersionInfo
	if err := json.Unmarshal(recorder.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(info.CheckError, "版本服务") || info.CurrentVersion != "v0.1.0" {
		t.Fatalf("unexpected response: %+v", info)
	}
}

func TestVersionIsNewer(t *testing.T) {
	tests := []struct {
		latest  string
		current string
		want    bool
	}{
		{"v0.2.0", "v0.1.9", true},
		{"v1.0.0", "v0.99.99", true},
		{"v1.0.0", "v1.0.0", false},
		{"v1.0.0-beta.1", "v1.0.0", false},
		{"v1.0.0", "v1.0.0-beta.1", true},
		{"v1.0.0+build.2", "v1.0.0+build.1", false},
		{"v1.0.0", "dev", true},
	}
	for _, tt := range tests {
		if got := versionIsNewer(tt.latest, tt.current); got != tt.want {
			t.Errorf("versionIsNewer(%q, %q)=%v want %v", tt.latest, tt.current, got, tt.want)
		}
	}
}

func TestPruneUpdateBackupsWithFewerFilesThanLimit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "pre-update-one.db")
	if err := os.WriteFile(path, []byte("backup"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := pruneUpdateBackups(dir, 5); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("backup should be retained: %v", err)
	}
}
