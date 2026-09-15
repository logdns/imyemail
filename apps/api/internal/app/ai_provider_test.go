package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestAIProtocolRequests(t *testing.T) {
	for _, tc := range []struct{ protocol, path, header, response string }{
		{"openai-chat", "/v1/chat/completions", "Authorization", `{"choices":[{"message":{"content":"Hello"},"finish_reason":"stop"}]}`},
		{"openai-responses", "/v1/responses", "Authorization", `{"status":"completed","output":[{"type":"reasoning"},{"type":"message","status":"completed","content":[{"type":"output_text","text":"Hello"}]}]}`},
		{"anthropic", "/v1/messages", "x-api-key", `{"stop_reason":"end_turn","content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"Hello"}]}`},
		{"gemini", "/v1/models/test-model:generateContent", "x-goog-api-key", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"thought":true,"text":"private"},{"text":"Hello"}]}}]}`},
	} {
		t.Run(tc.protocol, func(t *testing.T) {
			client := &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
				wantKey := "test-only-key"
				if tc.header == "Authorization" {
					wantKey = "Bearer " + wantKey
				}
				if r.URL.Path != tc.path || r.URL.RawQuery != "" || r.Header.Get(tc.header) != wantKey {
					t.Fatal("incorrect endpoint or authentication")
				}
				for _, header := range []string{"Authorization", "x-api-key", "x-goog-api-key"} {
					if header != tc.header && r.Header.Get(header) != "" {
						t.Fatal("credential sent under extra header")
					}
				}
				var body map[string]any
				if json.NewDecoder(r.Body).Decode(&body) != nil {
					t.Fatal("invalid JSON")
				}
				if strings.Contains(jsonEncode(body), "test-only-key") {
					t.Fatal("credential in payload")
				}
				switch tc.protocol {
				case "openai-chat":
					if body["max_tokens"] != float64(2000) || len(body["messages"].([]any)) != 2 {
						t.Fatal("invalid chat request")
					}
				case "openai-responses":
					if body["store"] != false || body["max_output_tokens"] != float64(2000) || body["instructions"] == nil || body["input"] == nil || body["messages"] != nil {
						t.Fatal("invalid Responses request")
					}
				case "anthropic":
					if r.Header.Get("anthropic-version") != "2023-06-01" || body["system"] == nil || len(body["messages"].([]any)) != 1 {
						t.Fatal("invalid Messages request")
					}
				case "gemini":
					if body["systemInstruction"] == nil || body["contents"] == nil || body["model"] != nil || body["messages"] != nil {
						t.Fatal("invalid GenerateContent request")
					}
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.response)), Header: make(http.Header)}, nil
			})}
			out, err := generateAIMail(context.Background(), client, aiSettings{Protocol: tc.protocol, BaseURL: "https://provider.example/v1", Model: "test-model", APIKey: "test-only-key"}, aiMailRequest{Action: "compose", Language: "en", Instruction: "Say hello"})
			if err != nil || out != "Hello" {
				t.Fatalf("generation failed: %v", err)
			}
		})
	}
}

func TestAIProtocolIncompleteResponses(t *testing.T) {
	for _, tc := range []struct{ protocol, body string }{
		{"openai-chat", `{"choices":[{"message":{"content":"Hello","refusal":"blocked"},"finish_reason":"stop"}]}`},
		{"openai-chat", `{"choices":[{"message":{"content":"Hello","tool_calls":[{}]}}]}`},
		{"openai-responses", `{"status":"incomplete","output":[{"type":"message","status":"completed","content":[{"type":"output_text","text":"Partial"}]}]}`},
		{"openai-responses", `{"status":"completed","output":[{"type":"message","status":"completed","content":[{"type":"refusal","text":"No"}]}]}`},
		{"openai-responses", `{"status":"completed","output":[{"type":"function_call"}]}`},
		{"anthropic", `{"stop_reason":"max_tokens","content":[{"type":"text","text":"Partial"}]}`},
		{"anthropic", `{"stop_reason":"tool_use","content":[{"type":"text","text":"Partial"}]}`},
		{"anthropic", `{"stop_reason":"end_turn","content":[{"type":"tool_use","text":"Partial"}]}`},
		{"gemini", `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"Partial"}]}}]}`},
		{"gemini", `{"promptFeedback":{"blockReason":"SAFETY"},"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Partial"}]}}]}`},
		{"gemini", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"thought":true,"text":"private"}]}}]}`},
		{"gemini", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Partial","functionCall":{}}]}}]}`},
	} {
		if _, err := parseAIText(tc.protocol, []byte(tc.body)); err == nil {
			t.Errorf("accepted incomplete %s output", tc.protocol)
		}
	}
	for _, protocol := range []string{"openai-chat", "openai-responses", "anthropic", "gemini"} {
		for _, body := range []string{`{`, `{}`, `{"error":{"message":"secret detail"}}`} {
			if _, err := parseAIText(protocol, []byte(body)); err == nil || strings.Contains(err.Error(), "secret detail") {
				t.Errorf("unsafe %s error", protocol)
			}
		}
	}
	for _, model := range []string{"../metadata", "x?key=value", "x#fragment", "x/y", "..", "x:generateContent", ""} {
		if validGeminiModel(model) {
			t.Errorf("accepted unsafe model %q", model)
		}
	}
}

func TestAIConnectionTestPermissionsAndCredentialSwitch(t *testing.T) {
	a := newTestApp(t)
	stopTestWorkers(a)
	calls := 0
	a.aiHTTPClient = &http.Client{Transport: aiTestTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), "synthetic connectivity test") {
			t.Error("not a synthetic probe")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"Private generated probe"}}]}`))}, nil
	})}
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	admin := &testClient{t: t, server: ts}
	anon := &testClient{t: t, server: ts}
	if anon.do("POST", "/api/admin/ai/test", nil, nil) != 401 {
		t.Fatal("anonymous probe permitted")
	}
	if admin.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil) != 200 {
		t.Fatal("login")
	}
	if admin.do("POST", "/api/admin/ai/test", nil, nil) != 400 {
		t.Fatal("empty settings probe")
	}
	settings := map[string]any{"enabled": false, "protocol": "openai-chat", "baseUrl": "https://provider.example/v1", "model": "test-model", "apiKey": "test-only-key"}
	if admin.do("POST", "/api/admin/ai/settings", settings, nil) != 200 {
		t.Fatal("save")
	}
	var result map[string]any
	if admin.do("POST", "/api/admin/ai/test", map[string]string{"text": "must never be forwarded"}, &result) != 200 || len(result) != 1 || result["ok"] != true {
		t.Fatal("disabled probe or output privacy")
	}
	if admin.doWithHeaders("POST", "/api/admin/ai/test", nil, map[string]string{"Origin": "https://evil.example"}, nil) != 403 {
		t.Fatal("CSRF probe")
	}
	settings["protocol"] = "anthropic"
	settings["apiKey"] = ""
	if admin.do("POST", "/api/admin/ai/settings", settings, nil) != 400 {
		t.Fatal("credential reused across protocols")
	}
	settings["protocol"] = "unknown"
	settings["apiKey"] = "replacement-test-key"
	if admin.do("POST", "/api/admin/ai/settings", settings, nil) != 400 {
		t.Fatal("unknown protocol saved")
	}
	if calls != 1 {
		t.Fatal("unexpected external calls")
	}
	// Test the permission middleware independently of the role defaults.
	req := httptest.NewRequest("POST", "/api/admin/ai/test", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, &User{ID: "reader", Role: "user", Permissions: []string{PermissionSettingsView}}))
	w := httptest.NewRecorder()
	a.requirePermission(PermissionSettingsUpdate)(http.HandlerFunc(a.handleTestAISettings)).ServeHTTP(w, req)
	if w.Code != 403 || calls != 1 {
		t.Fatal("read-only admin can spend provider credits")
	}
}

// Explicit opt-in only: the file contains an array of aiSettings records with
// test credentials. Never print records, raw responses or provider errors.
// Normal CI cannot accidentally make billable calls or read developer secrets.
func TestAILiveProviders(t *testing.T) {
	path := os.Getenv("IMYEMAIL_AI_LIVE_CONFIG")
	if path == "" {
		t.Skip("set IMYEMAIL_AI_LIVE_CONFIG to a private test JSON file to run real provider calls")
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		t.Fatal("live config must be a private regular file (0600)")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal("cannot read live config")
	}
	var providers []aiSettings
	if json.Unmarshal(raw, &providers) != nil || len(providers) == 0 {
		t.Fatal("invalid live config")
	}
	for i, s := range providers {
		if !validAIProtocol(s.Protocol) || s.APIKey == "" || s.Model == "" {
			t.Fatalf("invalid live provider entry %d", i+1)
		}
		for _, action := range []string{"compose", "summary", "reply"} {
			_, err := generateAIMail(context.Background(), newAIHTTPClient(), s, aiMailRequest{Action: action, Language: "en", Instruction: "Use one short sentence.", Subject: "Synthetic test", Text: "This is a synthetic test message. A fictional meeting is on Monday."})
			if err != nil {
				t.Errorf("live provider entry %d (%s), action %s failed; inspect account configuration privately", i+1, normalizeAIProtocol(s.Protocol), action)
			}
		}
	}
}
