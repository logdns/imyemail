package app

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAIEndpointNormalization(t *testing.T) {
	for _, tc := range []struct{ protocol, base, want string }{
		{"openai-chat", "https://example.com", "/v1/chat/completions"},
		{"openai-responses", "https://example.com/", "/v1/responses"},
		{"openai-responses", "https://example.com/responses", "/responses"},
		{"anthropic", "https://example.com", "/v1/messages"},
		{"gemini", "https://example.com", "/v1beta/models/test:generateContent"},
		{"openai-chat", "https://example.com/custom/v2/chat/completions/", "/custom/v2/chat/completions"},
		{"openai-responses", "https://example.com/v1/responses", "/v1/responses"},
		{"anthropic", "https://example.com/v1/messages", "/v1/messages"},
		{"gemini", "https://example.com/v1beta/models/old:generateContent", "/v1beta/models/test:generateContent"},
	} {
		s := aiSettings{Protocol: tc.protocol, BaseURL: tc.base, Model: "test"}
		u, err := aiProviderEndpoint(s, false)
		if err != nil || u.Path != tc.want {
			t.Fatalf("%s: got %v, %v", tc.base, u, err)
		}
		u, err = aiProviderEndpoint(s, true)
		if err != nil || !strings.HasSuffix(u.Path, "/models") || strings.Contains(u.Path, "generateContent") || strings.Contains(u.Path, "completions") {
			t.Fatalf("bad model endpoint %v %v", u, err)
		}
	}
}

// Real HTTP framing, TLS and JSON decoding; only this test transport bypasses
// public DNS so no external provider credentials or billable calls are needed.
func TestAIModelsTLSIntegration(t *testing.T) {
	for _, protocol := range []string{"openai-chat", "openai-responses", "anthropic", "gemini"} {
		t.Run(protocol, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "GET" || r.URL.Path != "/v1/models" {
					t.Errorf("wrong request: %s %s", r.Method, r.URL.Path)
				}
				if protocol == "gemini" {
					if r.Header.Get("x-goog-api-key") != "test-key" {
						t.Error("missing key")
					}
					io.WriteString(w, `{"models":[{"name":"models/text-model","supportedGenerationMethods":["generateContent"]},{"name":"models/embed","supportedGenerationMethods":["embedContent"]}],"nextPageToken":"opaque-do-not-follow-url"}`)
				} else {
					if protocol == "anthropic" && r.Header.Get("anthropic-version") == "" {
						t.Error("missing version")
					}
					io.WriteString(w, `{"data":[{"id":"z-model"},{"id":"a-model"},{"id":"z-model"},{"id":"bad\nmodel"}],"has_more":true}`)
				}
			}))
			defer server.Close()
			transport := server.Client().Transport.(*http.Transport).Clone()
			transport.TLSClientConfig = &tls.Config{RootCAs: transport.TLSClientConfig.RootCAs}
			transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
			}
			defer transport.CloseIdleConnections()
			models, truncated, err := fetchAIModels(context.Background(), &http.Client{Transport: transport}, aiSettings{Protocol: protocol, BaseURL: "https://example.com/v1", APIKey: "test-key"})
			if err != nil || !truncated {
				t.Fatalf("fetch failed: %v", err)
			}
			want := "a-model,z-model"
			if protocol == "gemini" {
				want = "text-model"
			}
			if strings.Join(models, ",") != want {
				t.Fatalf("models: %v", models)
			}
		})
	}
}

func TestAIProbeDraftSecurity(t *testing.T) {
	a := newTestApp(t)
	stopTestWorkers(a)
	calls := 0
	a.aiHTTPClient = &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("incorrect credential")
		}
		body := `{"data":[{"id":"fetched"}]}`
		if r.Method == "POST" {
			var payload map[string]any
			json.NewDecoder(r.Body).Decode(&payload)
			if payload["model"] != "draft-model" {
				t.Error("ignored draft model")
			}
			body = `{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	admin := &testClient{t: t, server: ts}
	anon := &testClient{t: t, server: ts}
	if anon.do("POST", "/api/admin/ai/models", nil, nil) != 401 {
		t.Fatal("anonymous discovery")
	}
	admin.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil)
	saved := map[string]any{"protocol": "openai-chat", "baseUrl": "https://example.com/v1", "model": "saved-model", "apiKey": "test-key"}
	if admin.do("POST", "/api/admin/ai/settings", saved, nil) != 200 {
		t.Fatal("save")
	}

	for _, invalid := range []map[string]any{
		{"protocol": "unknown", "baseUrl": "https://example.com/v1", "apiKey": "test-key"},
		{"protocol": "openai-chat", "baseUrl": "https://127.0.0.1/v1", "apiKey": "test-key"},
		{"protocol": "openai-chat", "baseUrl": "http://example.com/v1", "apiKey": "test-key"},
		{"protocol": "openai-chat", "baseUrl": "https://example.com/v1", "apiKey": "bad\nkey"},
		{"protocol": "openai-chat", "baseUrl": "https://example.com/v1", "apiKey": "test-key", "clearApiKey": true},
		{"protocol": "openai-chat", "baseUrl": "https://example.com/v1", "apiKey": strings.Repeat("x", 17000)},
	} {
		if admin.do("POST", "/api/admin/ai/models", map[string]any{"settings": invalid}, nil) != 400 {
			t.Fatal("invalid probe accepted")
		}
	}
	draft := map[string]any{"protocol": "openai-chat", "baseUrl": "https://example.com/v1", "model": "draft-model"}
	for _, route := range []string{"models", "test"} {
		if admin.do("POST", "/api/admin/ai/"+route, map[string]any{"settings": draft}, nil) != 200 {
			t.Fatal("draft probe")
		}
		draft["baseUrl"] = "https://different.example/v1"
		if admin.do("POST", "/api/admin/ai/"+route, map[string]any{"settings": draft}, nil) != 400 {
			t.Fatal("key forwarded to changed provider")
		}
		draft["baseUrl"] = "https://example.com/v1"
	}
	s, _ := a.loadAISettings(context.Background())
	if s.Model != "saved-model" || calls != 2 {
		t.Fatal("probe changed saved settings or called unsafe target")
	}
	if admin.doWithHeaders("POST", "/api/admin/ai/models", nil, map[string]string{"Origin": "https://evil.example"}, nil) != 403 {
		t.Fatal("CSRF discovery")
	}
	req := httptest.NewRequest("POST", "/api/admin/ai/models", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, &User{ID: "reader", Role: "user", Permissions: []string{PermissionSettingsView}}))
	w := httptest.NewRecorder()
	a.requirePermission(PermissionSettingsUpdate)(http.HandlerFunc(a.handleAIModels)).ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatal("read-only discovery")
	}
}

func TestAIDiagnosticsAndReasoningCompatibility(t *testing.T) {
	for _, status := range []int{400, 401, 402, 403, 404, 405, 422, 429, 500, 503} {
		client := &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(`{"error":"secret-key"}`))}, nil
		})}
		_, err := requestAIText(context.Background(), client, aiSettings{BaseURL: "https://example.com", Model: "test"}, "test", "test")
		msg := aiDiagnostic(err)
		if !strings.Contains(msg, "HTTP") || strings.Contains(msg, "secret-key") {
			t.Fatal("unsafe or unhelpful error")
		}
	}
	for _, model := range []string{"gpt-5", "openai/gpt-5.6-sol", "o3-mini"} {
		client := &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
			var payload map[string]any
			json.NewDecoder(r.Body).Decode(&payload)
			if payload["max_tokens"] != nil || payload["max_completion_tokens"] != float64(2000) {
				t.Error("legacy token field sent to reasoning model")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}`))}, nil
		})}
		if _, err := requestAIText(context.Background(), client, aiSettings{BaseURL: "https://example.com", Model: model}, "test", "test"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := parseAIText("openai-responses", []byte(`{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}`)); err != nil {
		t.Fatal("gateway omitted optional message status", err)
	}
}

func TestAIModelListBoundsAndFailures(t *testing.T) {
	for _, body := range []string{`{`, `{}`, `{"data":null}`, `{"error":{"message":"private upstream detail"}}`, strings.Repeat("x", (1<<20)+1)} {
		client := &http.Client{Transport: aiTestTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
		})}
		_, _, err := fetchAIModels(context.Background(), client, aiSettings{BaseURL: "https://example.com/v1"})
		if err == nil || strings.Contains(aiDiagnostic(err), "private upstream detail") {
			t.Fatal("invalid response accepted or leaked")
		}
	}
	entries := make([]map[string]string, 1002)
	for i := range entries {
		entries[i] = map[string]string{"id": fmt.Sprintf("model-%04d", i)}
	}
	raw, _ := json.Marshal(map[string]any{"data": entries})
	client := &http.Client{Transport: aiTestTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(raw)))}, nil
	})}
	models, truncated, err := fetchAIModels(context.Background(), client, aiSettings{BaseURL: "https://example.com/v1"})
	if err != nil || len(models) != 1000 || !truncated {
		t.Fatal("unbounded model list", err)
	}
	for _, err := range []error{context.DeadlineExceeded, &net.DNSError{Err: "private resolver detail", Name: "secret-host"}} {
		msg := aiDiagnostic(aiTransportError(err))
		if strings.Contains(msg, "private") || strings.Contains(msg, "secret-host") {
			t.Fatal("transport error leaked")
		}
	}
}
