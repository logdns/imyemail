package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	BuildVersion = "dev"
	BuildCommit  = ""
	BuildDate    = ""
)

type systemVersionInfo struct {
	CurrentVersion  string     `json:"currentVersion"`
	CurrentCommit   string     `json:"currentCommit,omitempty"`
	BuildDate       string     `json:"buildDate,omitempty"`
	LatestVersion   string     `json:"latestVersion,omitempty"`
	LatestName      string     `json:"latestName,omitempty"`
	ReleaseURL      string     `json:"releaseUrl,omitempty"`
	ReleaseNotes    string     `json:"releaseNotes,omitempty"`
	PublishedAt     *time.Time `json:"publishedAt,omitempty"`
	UpdateAvailable bool       `json:"updateAvailable"`
	UpdateEnabled   bool       `json:"updateEnabled"`
	CheckError      string     `json:"checkError,omitempty"`
}

type systemOperationStatus struct {
	OK        bool                    `json:"ok"`
	Rollback  systemRollbackInfo      `json:"rollback"`
	Operation systemOperationProgress `json:"operation"`
}

type systemRollbackInfo struct {
	Available bool       `json:"available"`
	Image     string     `json:"image,omitempty"`
	Version   string     `json:"version,omitempty"`
	CreatedAt *time.Time `json:"createdAt,omitempty"`
	Reason    string     `json:"reason,omitempty"`
}

type systemOperationProgress struct {
	Action      string     `json:"action,omitempty"`
	Phase       string     `json:"phase"`
	Message     string     `json:"message,omitempty"`
	RequestedAt *time.Time `json:"requestedAt,omitempty"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
	Error       string     `json:"error,omitempty"`
}

type githubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	HTMLURL     string    `json:"html_url"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
}

func (a *App) handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	info, err := a.systemVersion(r.Context())
	if err != nil {
		info.CheckError = "暂时无法连接版本服务"
		a.log.Warn("check system version", "error", err)
	}
	respondJSON(w, http.StatusOK, info)
}

func (a *App) handleSystemUpdate(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil || user.Role != "admin" {
		respondError(w, http.StatusForbidden, "system administrator required")
		return
	}
	if !a.updateEnabled() {
		respondError(w, http.StatusServiceUnavailable, "online update is not configured")
		return
	}

	info, err := a.systemVersion(r.Context())
	if err != nil {
		respondError(w, http.StatusBadGateway, "failed to check latest release")
		return
	}
	if !info.UpdateAvailable {
		respondError(w, http.StatusConflict, "already on the latest version")
		return
	}

	backupPath, err := a.backupDatabaseBeforeUpdate(r.Context())
	if err != nil {
		a.log.Error("backup database before update", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to back up database")
		return
	}
	a.log.Info("system update queued", "from", info.CurrentVersion, "to", info.LatestVersion, "backup", backupPath)
	respondJSON(w, http.StatusAccepted, map[string]any{
		"ok":             true,
		"currentVersion": info.CurrentVersion,
		"targetVersion":  info.LatestVersion,
		"message":        "更新已进入队列，服务会在完成后自动恢复",
	})

	// The updater recreates this API container. Trigger it only after the handler has
	// returned so the browser reliably receives the accepted response first.
	a.startWorker(func() {
		time.Sleep(1500 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
		defer cancel()
		if err := a.triggerUpdateService(ctx); err != nil {
			a.log.Error("trigger queued system update", "error", err)
		}
	})
}

func (a *App) handleSystemOperation(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil || user.Role != "admin" {
		respondError(w, http.StatusForbidden, "system administrator required")
		return
	}
	if !a.updateEnabled() {
		respondError(w, http.StatusServiceUnavailable, "online update is not configured")
		return
	}
	status, err := a.fetchSystemOperation(r.Context())
	if err != nil {
		a.log.Warn("fetch system operation status", "error", err)
		respondJSON(w, http.StatusOK, systemOperationStatus{
			Rollback:  systemRollbackInfo{Reason: "当前部署尚未启用后台回滚服务，请先在服务器执行 sudo imyemail update"},
			Operation: systemOperationProgress{Phase: "unavailable", Message: "后台回滚服务不可用"},
		})
		return
	}
	respondJSON(w, http.StatusOK, status)
}

func (a *App) handleSystemRollback(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil || user.Role != "admin" {
		respondError(w, http.StatusForbidden, "system administrator required")
		return
	}
	var input struct {
		Confirm bool `json:"confirm"`
	}
	if err := decodeJSON(r, &input); err != nil || !input.Confirm {
		respondError(w, http.StatusBadRequest, "rollback confirmation required")
		return
	}
	status, err := a.fetchSystemOperation(r.Context())
	if err != nil {
		respondError(w, http.StatusServiceUnavailable, "rollback service is unavailable")
		return
	}
	if !status.Rollback.Available {
		respondError(w, http.StatusConflict, "no rollback version is available")
		return
	}
	if status.Operation.Phase == "preparing" || status.Operation.Phase == "running" {
		respondError(w, http.StatusConflict, "another system operation is already running")
		return
	}
	if err := a.triggerServiceOperation(r.Context(), "/v1/rollback"); err != nil {
		a.log.Error("trigger system rollback", "error", err)
		respondError(w, http.StatusBadGateway, "failed to start rollback")
		return
	}
	a.log.Warn("system rollback requested", "image", status.Rollback.Image, "version", status.Rollback.Version)
	respondJSON(w, http.StatusAccepted, map[string]any{
		"ok":      true,
		"version": status.Rollback.Version,
		"message": "回滚已启动；数据库内容不会回滚，服务恢复后页面会自动刷新",
	})
}

func (a *App) handleDeleteSystemRollback(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil || user.Role != "admin" {
		respondError(w, http.StatusForbidden, "system administrator required")
		return
	}
	var input struct {
		Confirm bool `json:"confirm"`
	}
	if err := decodeJSON(r, &input); err != nil || !input.Confirm {
		respondError(w, http.StatusBadRequest, "rollback deletion confirmation required")
		return
	}
	status, err := a.fetchSystemOperation(r.Context())
	if err != nil {
		respondError(w, http.StatusServiceUnavailable, "rollback service is unavailable")
		return
	}
	if !status.Rollback.Available {
		respondError(w, http.StatusConflict, "no rollback version is available")
		return
	}
	if status.Operation.Phase == "preparing" || status.Operation.Phase == "running" {
		respondError(w, http.StatusConflict, "another system operation is already running")
		return
	}
	if err := a.triggerServiceRequest(r.Context(), http.MethodDelete, "/v1/rollback"); err != nil {
		a.log.Error("delete system rollback", "error", err)
		respondError(w, http.StatusBadGateway, "failed to delete rollback version")
		return
	}
	a.log.Warn("system rollback deleted", "image", status.Rollback.Image, "version", status.Rollback.Version)
	respondJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": status.Rollback.Version,
		"message": "回滚版本已删除；当前版本、数据库和邮件不受影响",
	})
}

func (a *App) systemVersion(ctx context.Context) (systemVersionInfo, error) {
	current := strings.TrimSpace(a.configSnapshot().AppVersion)
	if current == "" {
		current = BuildVersion
	}
	info := systemVersionInfo{
		CurrentVersion: current,
		CurrentCommit:  strings.TrimSpace(BuildCommit),
		BuildDate:      strings.TrimSpace(BuildDate),
		UpdateEnabled:  a.updateEnabled(),
	}

	release, err := a.fetchLatestRelease(ctx)
	if err != nil {
		return info, err
	}
	info.LatestVersion = strings.TrimSpace(release.TagName)
	info.LatestName = strings.TrimSpace(release.Name)
	info.ReleaseURL = strings.TrimSpace(release.HTMLURL)
	info.ReleaseNotes = strings.TrimSpace(release.Body)
	if !release.PublishedAt.IsZero() {
		info.PublishedAt = &release.PublishedAt
	}
	info.UpdateAvailable = versionIsNewer(info.LatestVersion, info.CurrentVersion)
	return info, nil
}

func (a *App) fetchLatestRelease(ctx context.Context) (githubRelease, error) {
	endpoint := strings.TrimSpace(a.configSnapshot().ReleaseAPIURL)
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return githubRelease{}, errors.New("invalid release API URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "imyemail/"+strings.TrimPrefix(a.configSnapshot().AppVersion, "v"))
	client := &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return githubRelease{}, fmt.Errorf("release API returned %s", resp.Status)
	}
	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&release); err != nil {
		return githubRelease{}, err
	}
	if strings.TrimSpace(release.TagName) == "" {
		return githubRelease{}, errors.New("release API returned an empty tag")
	}
	return release, nil
}

func (a *App) updateEnabled() bool {
	return strings.TrimSpace(a.configSnapshot().UpdateServiceURL) != "" && strings.TrimSpace(a.configSnapshot().UpdateServiceToken) != ""
}

func (a *App) triggerUpdateService(ctx context.Context) error {
	return a.triggerServiceOperation(ctx, "/v1/update")
}

func (a *App) triggerServiceOperation(ctx context.Context, operationPath string) error {
	return a.triggerServiceRequest(ctx, http.MethodPost, operationPath)
}

func (a *App) triggerServiceRequest(ctx context.Context, method, operationPath string) error {
	if method != http.MethodPost && !(method == http.MethodDelete && operationPath == "/v1/rollback") {
		return errors.New("invalid update service method")
	}
	parsed, err := a.updateServiceEndpoint(operationPath)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, parsed.String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(a.configSnapshot().UpdateServiceToken))
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("update service returned %s", resp.Status)
	}
	return nil
}

func (a *App) fetchSystemOperation(ctx context.Context) (systemOperationStatus, error) {
	parsed, err := a.updateServiceEndpoint("/v1/status")
	if err != nil {
		return systemOperationStatus{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return systemOperationStatus{}, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(a.configSnapshot().UpdateServiceToken))
	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return systemOperationStatus{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return systemOperationStatus{}, fmt.Errorf("update service returned %s", resp.Status)
	}
	var status systemOperationStatus
	if err := json.NewDecoder(io.LimitReader(resp.Body, 128<<10)).Decode(&status); err != nil {
		return systemOperationStatus{}, err
	}
	return status, nil
}

func (a *App) updateServiceEndpoint(operationPath string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(a.configSnapshot().UpdateServiceURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("invalid update service URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("invalid update service URL")
	}
	if operationPath != "/v1/update" && operationPath != "/v1/status" && operationPath != "/v1/rollback" {
		return nil, errors.New("invalid update operation")
	}
	parsed.Path = operationPath
	parsed.RawPath = ""
	return parsed, nil
}

func (a *App) backupDatabaseBeforeUpdate(ctx context.Context) (string, error) {
	backupDir := filepath.Join(a.configSnapshot().DataDir, "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		return "", err
	}
	if err := os.Chmod(backupDir, 0o700); err != nil {
		return "", err
	}
	backupPath := filepath.Join(backupDir, "pre-update-"+a.now().UTC().Format("20060102T150405.000000000Z")+".db")
	quotedPath := strings.ReplaceAll(backupPath, "'", "''")
	if _, err := a.db.ExecContext(ctx, "VACUUM INTO '"+quotedPath+"'"); err != nil {
		return "", err
	}
	if err := os.Chmod(backupPath, 0o600); err != nil {
		return "", err
	}
	if err := pruneUpdateBackups(backupDir, 5); err != nil {
		a.log.Warn("prune update backups", "error", err)
	}
	return backupPath, nil
}

func pruneUpdateBackups(dir string, keep int) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	type backupFile struct {
		path    string
		modTime time.Time
	}
	backups := make([]backupFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "pre-update-") || !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		backups = append(backups, backupFile{path: filepath.Join(dir, entry.Name()), modTime: info.ModTime()})
	}
	sort.Slice(backups, func(i, j int) bool { return backups[i].modTime.After(backups[j].modTime) })
	if keep < 0 {
		keep = 0
	}
	if len(backups) <= keep {
		return nil
	}
	for _, backup := range backups[keep:] {
		if err := os.Remove(backup.path); err != nil {
			return err
		}
	}
	return nil
}

var versionPattern = regexp.MustCompile(`^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$`)

func versionIsNewer(latest, current string) bool {
	latestParts, latestPrerelease, latestOK := parseVersion(latest)
	currentParts, currentPrerelease, currentOK := parseVersion(current)
	if !latestOK {
		return false
	}
	if !currentOK {
		return true
	}
	for i := 0; i < len(latestParts); i++ {
		if latestParts[i] != currentParts[i] {
			return latestParts[i] > currentParts[i]
		}
	}
	return currentPrerelease != "" && latestPrerelease == ""
}

func parseVersion(value string) ([3]int, string, bool) {
	match := versionPattern.FindStringSubmatch(strings.TrimSpace(value))
	if match == nil {
		return [3]int{}, "", false
	}
	var parts [3]int
	for i := 0; i < 3; i++ {
		if match[i+1] == "" {
			continue
		}
		part, err := strconv.Atoi(match[i+1])
		if err != nil {
			return [3]int{}, "", false
		}
		parts[i] = part
	}
	return parts, match[4], true
}
