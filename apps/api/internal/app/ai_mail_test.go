package app

import (
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type aiTestTransport func(*http.Request) (*http.Response, error)

func (f aiTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestAIProviderSafety(t *testing.T) {
	for _, base := range []string{"http://example.com/v1", "https://user:key@example.com", "https://example.com/?key=secret", "https://example.com/#fragment", "https://127.0.0.1", "https://[::1]", "https://169.254.169.254", "https://100.100.100.200", "https://localhost"} {
		if _, err := aiEndpoint(base); err == nil {
			t.Errorf("accepted unsafe URL %s", base)
		}
	}
	for _, raw := range []string{"10.0.0.1", "::ffff:127.0.0.1", "fc00::1", "100.64.0.1", "198.18.0.1", "2002:7f00:1::", "64:ff9b::7f00:1"} {
		if isPublicAIIP(net.ParseIP(raw)) {
			t.Errorf("accepted unsafe IP %s", raw)
		}
	}
	if !isPublicAIIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("rejected public IP")
	}
	endpoint, err := aiEndpoint("https://provider.example/v1/")
	if err != nil || endpoint.String() != "https://provider.example/v1/chat/completions" {
		t.Fatalf("bad endpoint: %v", err)
	}
	client := newAIHTTPClient()
	if client.CheckRedirect(nil, nil) != http.ErrUseLastResponse {
		t.Fatal("redirects permitted")
	}
	if client.Transport.(*http.Transport).Proxy != nil {
		t.Fatal("proxy could bypass IP validation")
	}
	if _, err := aiDialContext(context.Background(), "tcp", "127.0.0.1:443"); err == nil {
		t.Fatal("dial allowed loopback")
	}
}

func TestAIProviderResponses(t *testing.T) {
	input := aiMailRequest{Action: "compose", Instruction: "Write a greeting", Text: "draft", Language: "en"}
	settings := aiSettings{BaseURL: "https://provider.example/v1", APIKey: "test-only-key", Model: "example-model"}
	for _, tc := range []struct {
		name, body string
		status     int
		valid      bool
	}{
		{"success", `{"choices":[{"message":{"content":"Hello"},"finish_reason":"stop"}]}`, 200, true},
		{"empty", `{"choices":[]}`, 200, false},
		{"empty content", `{"choices":[{"message":{"content":" "}}]}`, 200, false},
		{"truncated", `{"choices":[{"message":{"content":"unfinished"},"finish_reason":"length"}]}`, 200, false},
		{"malformed", `{`, 200, false},
		{"oversized", strings.Repeat("x", 256<<10+1), 200, false},
		{"upstream secret", `sensitive upstream detail`, 401, false},
		{"redirect", "", 302, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-only-key" {
					t.Error("invalid upstream request")
				}
				return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body)), Header: make(http.Header)}, nil
			})}
			text, err := generateAIMail(context.Background(), client, settings, input)
			if tc.valid && (err != nil || text != "Hello") {
				t.Fatalf("failed success: %v", err)
			}
			if !tc.valid && err == nil {
				t.Fatal("accepted invalid response")
			}
			if err != nil && strings.Contains(err.Error(), "sensitive") {
				t.Fatal("leaked provider response")
			}
		})
	}
}

func TestAILimiter(t *testing.T) {
	var l aiLimiter
	now := time.Now()
	var release []func()
	for i := 0; i < 4; i++ {
		done, ok := l.acquire("alice", now)
		if !ok {
			t.Fatal("early concurrency rejection")
		}
		release = append(release, done)
	}
	if _, ok := l.acquire("bob", now); ok {
		t.Fatal("global concurrency limit bypassed")
	}
	for _, done := range release {
		done()
	}
	for i := 0; i < 6; i++ {
		done, ok := l.acquire("alice", now)
		if !ok {
			t.Fatal("early rate rejection")
		}
		done()
	}
	if _, ok := l.acquire("alice", now); ok {
		t.Fatal("user rate limit bypassed")
	}
	done, ok := l.acquire("alice", now.Add(time.Minute))
	if !ok {
		t.Fatal("window did not reset")
	}
	done()
}

func TestAISettingsAndMailAuthorization(t *testing.T) {
	a := newTestApp(t)
	var calls atomic.Int32
	a.aiHTTPClient = &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		raw := jsonEncode(body)
		if strings.Contains(raw, "hidden-recipient@example.test") {
			t.Error("recipient metadata leaked")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"Test generated text"},"finish_reason":"stop"}]}`)), Header: make(http.Header)}, nil
	})}
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	admin := &testClient{t: t, server: ts}
	anon := &testClient{t: t, server: ts}
	check := func(got, want int) {
		t.Helper()
		if got != want {
			t.Fatalf("status=%d want=%d", got, want)
		}
	}
	check(admin.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil), 200)
	var user AdminUser
	check(admin.do("POST", "/api/admin/users", map[string]any{"loginName": "ai-user", "displayName": "AI User", "role": "user", "password": "Password123!", "disabled": false}, &user), 201)
	regular := &testClient{t: t, server: ts}
	check(regular.do("POST", "/api/auth/login", map[string]string{"loginName": "ai-user", "password": "Password123!"}, nil), 200)
	input := aiMailRequest{Action: "compose", Instruction: "Write a greeting", Language: "en"}
	check(anon.do("POST", "/api/mail/ai/compose", input, nil), 401)
	check(anon.do("GET", "/api/admin/ai/settings", nil, nil), 401)
	check(regular.do("GET", "/api/admin/ai/settings", nil, nil), 403)
	check(regular.do("POST", "/api/admin/ai/settings", map[string]any{}, nil), 403)
	check(regular.do("POST", "/api/mail/ai/compose", input, nil), 403)
	settings := map[string]any{"enabled": true, "baseUrl": "https://provider.example/v1", "model": "example-model", "apiKey": "test-only-secret"}
	var view map[string]any
	check(admin.do("POST", "/api/admin/ai/settings", settings, &view), 200)
	if view["apiKey"] != nil || strings.Contains(jsonEncode(view), "test-only-secret") || view["apiKeySet"] != true {
		t.Fatal("key exposure or wrong key state")
	}
	check(admin.do("GET", "/api/admin/ai/settings", nil, &view), 200)
	if strings.Contains(jsonEncode(view), "test-only-secret") {
		t.Fatal("key returned on read")
	}
	view = nil
	check(regular.do("GET", "/api/mail/ai/status", nil, &view), 200)
	if len(view) != 1 || view["enabled"] != true {
		t.Fatal("status leaks configuration")
	}
	view = nil
	check(anon.do("GET", "/api/public/settings", nil, &view), 200)
	if strings.Contains(jsonEncode(view), "test-only-secret") || view["aiSettings"] != nil {
		t.Fatal("public settings leaked AI configuration")
	}
	saved, err := a.loadAISettings(context.Background())
	if err != nil || saved.APIKey != "test-only-secret" {
		t.Fatal("settings not persisted")
	}
	settings["apiKey"] = ""
	check(admin.do("POST", "/api/admin/ai/settings", settings, nil), 200)
	saved, _ = a.loadAISettings(context.Background())
	if saved.APIKey != "test-only-secret" {
		t.Fatal("blank key overwrote credential")
	}
	settings["baseUrl"] = "https://other.example/v1"
	check(admin.do("POST", "/api/admin/ai/settings", settings, nil), 400)
	settings["baseUrl"] = "https://provider.example/v1"
	check(regular.do("POST", "/api/mail/ai/compose", input, nil), 200)
	input.Text = strings.Repeat("x", 20001)
	check(regular.do("POST", "/api/mail/ai/compose", input, nil), 400)
	input.Text = ""
	input.Language = "invalid"
	check(regular.do("POST", "/api/mail/ai/compose", input, nil), 400)
	input.Language = "en"
	input.Action = "summary"
	check(regular.do("POST", "/api/mail/ai/compose", input, nil), 400)
	_, mb := defaultAdminUserAndMailbox(t, a)
	folderID, err := a.ensureFolder(context.Background(), mb.ID, "Inbox")
	if err != nil {
		t.Fatal(err)
	}
	now := a.now().UTC().Format(time.RFC3339Nano)
	_, err = a.db.Exec(`INSERT INTO messages(id,mailbox_id,folder_id,recipient_addr,message_uid,message_id,subject,from_addr,from_name,to_addrs,cc_addrs,bcc_addrs,sent_at,received_at,snippet,body_text,body_html,is_read,is_starred,has_attachments,size_bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, "msg_ai", mb.ID, folderID, "", newID("uid"), "<ai@example.test>", "Test", mb.Address, "", "[]", "[]", `["hidden-recipient@example.test"]`, now, now, "snippet", strings.Repeat("文", 20001), "", 1, 0, 0, 20001, now, now)
	if err != nil {
		t.Fatal(err)
	}
	before := calls.Load()
	check(regular.do("POST", "/api/mail/messages/msg_ai/ai", input, nil), 404)
	check(regular.do("POST", "/api/mail/messages/missing/ai", input, nil), 404)
	if calls.Load() != before {
		t.Fatal("unauthorized message reached provider")
	}
	var output struct {
		Text      string `json:"text"`
		Truncated bool   `json:"truncated"`
	}
	check(admin.do("POST", "/api/mail/messages/msg_ai/ai", input, &output), 200)
	if !output.Truncated || output.Text != "Test generated text" {
		t.Fatal("summary or truncation failed")
	}
	settings["enabled"] = false
	settings["clearApiKey"] = true
	check(admin.do("POST", "/api/admin/ai/settings", settings, &view), 200)
	if view["apiKeySet"] != false {
		t.Fatal("key not cleared")
	}
	check(admin.do("POST", "/api/mail/messages/msg_ai/ai", input, nil), 403)
}

// Embed the unused methods; the AI reader may fetch only the selected raw message.
type aiTestIMAP struct {
	externalIMAPClient
	calls int
}

func (c *aiTestIMAP) Close() error { return nil }
func (c *aiTestIMAP) FetchRaw(ctx context.Context, folder string, uid uint32) ([]byte, externalIMAPRemoteMessage, error) {
	c.calls++
	return []byte("From: sender@example.test\r\nTo: hidden-recipient@example.test\r\nSubject: Remote test\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nRemote message body"), externalIMAPRemoteMessage{}, nil
}

type aiTestIMAPFactory struct{ client *aiTestIMAP }

func (f aiTestIMAPFactory) openExternalIMAPClient(context.Context, externalIMAPAccountRecord) (externalIMAPClient, error) {
	return f.client, nil
}

func TestAIExternalMailAndReadOnlyPermissions(t *testing.T) {
	a := newTestApp(t)
	stopTestWorkers(a)
	owner, mb := defaultAdminUserAndMailbox(t, a)
	updateTestConfig(a, func(cfg *Config) { cfg.ExternalIMAPEnabled = true })
	now := a.now().UTC().Format(time.RFC3339Nano)
	_, err := a.db.Exec(`INSERT INTO external_imap_accounts(id,user_id,mailbox_id,name,host,port,tls_mode,username,password_ciphertext,storage_mode,created_at,updated_at) VALUES(?,?,?,?,?,993,'tls',?,'unused','remote',?,?)`, "ext_ai", owner.ID, mb.ID, "Test remote", "imap.example.test", mb.Address, now, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = a.db.Exec(`INSERT INTO system_settings(key,value,updated_at) VALUES('aiSettings',?,?)`, jsonEncode(aiSettings{Enabled: true, BaseURL: "https://provider.example/v1", Model: "example-model", APIKey: "test-only-key"}), now)
	if err != nil {
		t.Fatal(err)
	}
	remote := &aiTestIMAP{}
	a.externalIMAP = aiTestIMAPFactory{client: remote}
	a.aiHTTPClient = &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), "Remote message body") || strings.Contains(string(raw), "hidden-recipient@example.test") {
			t.Error("incorrect remote email data sent to provider")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"Summary"}}]}`))}, nil
	})}
	path := "/api/mail/external-accounts/ext_ai/messages/" + encodeExternalRemoteID("Inbox", 1) + "/ai"
	// Exercise the real permission middleware with a controlled authenticated principal.
	invoke := func(actor *User, action string) int {
		req := httptest.NewRequest("POST", path, strings.NewReader(jsonEncode(aiMailRequest{Action: action, Language: "en"})))
		req = req.WithContext(context.WithValue(req.Context(), userContextKey, actor))
		routeCtx := chi.NewRouteContext()
		routeCtx.URLParams.Add("id", "ext_ai")
		routeCtx.URLParams.Add("remoteId", encodeExternalRemoteID("Inbox", 1))
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
		w := httptest.NewRecorder()
		a.requirePermission(PermissionMailRead)(a.requireExternalIMAPEnabled(http.HandlerFunc(a.handleAIMail))).ServeHTTP(w, req)
		return w.Code
	}
	reader := &User{ID: owner.ID, Role: "user", Permissions: []string{PermissionMailRead}}
	if code := invoke(reader, "summary"); code != 200 {
		t.Fatalf("read-only summary status=%d", code)
	}
	if code := invoke(reader, "reply"); code != 403 {
		t.Fatalf("read-only reply status=%d", code)
	}
	if code := invoke(&User{ID: owner.ID, Role: "user"}, "summary"); code != 403 {
		t.Fatalf("missing read permission status=%d", code)
	}
	if code := invoke(&User{ID: "other-user", Role: "user", Permissions: []string{PermissionMailRead}}, "summary"); code != 404 {
		t.Fatalf("cross-account status=%d", code)
	}
	if remote.calls != 1 {
		t.Fatal("unauthorized request reached IMAP")
	}
	updateTestConfig(a, func(cfg *Config) { cfg.ExternalIMAPEnabled = false })
	if code := invoke(reader, "summary"); code != 403 {
		t.Fatalf("disabled external IMAP status=%d", code)
	}
}

func TestAICancellationAndCSRF(t *testing.T) {
	a := newTestApp(t)
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	admin := &testClient{t: t, server: ts}
	if code := admin.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil); code != 200 {
		t.Fatalf("login=%d", code)
	}
	if code := admin.doWithHeaders("POST", "/api/admin/ai/settings", map[string]any{"enabled": false}, map[string]string{"Origin": "https://untrusted.example"}, nil); code != 403 {
		t.Fatalf("cross-origin settings mutation=%d", code)
	}
	client := &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := generateAIMail(ctx, client, aiSettings{BaseURL: "https://provider.example/v1"}, aiMailRequest{Action: "compose", Language: "en"})
	if err == nil {
		t.Fatal("canceled provider request succeeded")
	}
}
