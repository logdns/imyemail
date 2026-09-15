package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

func normalizeAIProtocol(protocol string) string {
	if protocol == "" {
		return "openai-chat"
	}
	return protocol
}

func validAIProtocol(protocol string) bool {
	switch normalizeAIProtocol(protocol) {
	case "openai-chat", "openai-responses", "anthropic", "gemini":
		return true
	}
	return false
}

func validGeminiModel(model string) bool {
	if model == "" || len(model) > 200 {
		return false
	}
	for _, c := range model {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.') {
			return false
		}
	}
	return model != "." && model != ".."
}

// Build each wire format explicitly. Third-party gateways select a protocol;
// arbitrary headers/query credentials and remote tools are never accepted.
func requestAIText(ctx context.Context, client *http.Client, s aiSettings, system, input string) (string, error) {
	endpoint, err := aiProviderEndpoint(s, false)
	if err != nil {
		return "", err
	}
	protocol := normalizeAIProtocol(s.Protocol)
	messages := []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": input}}
	payload := map[string]any{"model": s.Model, "stream": false, "max_tokens": 2000, "messages": messages}
	switch protocol {
	case "openai-chat":
		// Reasoning models reject the legacy max_tokens parameter.
		model := s.Model[strings.LastIndex(s.Model, "/")+1:]
		if strings.HasPrefix(model, "gpt-5") || strings.HasPrefix(model, "gpt-6") || strings.HasPrefix(model, "o1") || strings.HasPrefix(model, "o3") || strings.HasPrefix(model, "o4") {
			delete(payload, "max_tokens")
			payload["max_completion_tokens"] = 2000
		}
	case "openai-responses":
		payload = map[string]any{"model": s.Model, "stream": false, "store": false, "max_output_tokens": 2000, "instructions": system, "input": input}
	case "anthropic":
		payload = map[string]any{"model": s.Model, "stream": false, "max_tokens": 2000, "system": system, "messages": messages[1:]}
	case "gemini":
		if !validGeminiModel(s.Model) {
			return "", errors.New("invalid Gemini model ID")
		}
		payload = map[string]any{
			"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}},
			"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": input}}}},
			"generationConfig":  map[string]any{"maxOutputTokens": 2000},
		}
	default:
		return "", errors.New("invalid AI protocol")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", errors.New("invalid AI request")
	}
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return "", errors.New("invalid AI request")
	}
	req.Header.Set("Content-Type", "application/json")
	setAIHeaders(req, s)
	res, err := client.Do(req)
	if err != nil {
		return "", aiTransportError(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", aiStatusError(res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, (256<<10)+1))
	if err != nil || len(raw) > 256<<10 {
		return "", errors.New("invalid AI response size")
	}
	return parseAIText(protocol, raw)
}

func parseAIText(protocol string, raw []byte) (string, error) {
	// Decode only text and completion state. Never expose reasoning, tool calls,
	// provider diagnostics, identifiers or usage metadata to the mailbox UI.
	var result struct {
		Status  string          `json:"status"`
		Error   json.RawMessage `json:"error"`
		Choices []struct {
			Message struct {
				Content   string          `json:"content"`
				Refusal   string          `json:"refusal"`
				ToolCalls json.RawMessage `json:"tool_calls"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Output []struct {
			Type    string `json:"type"`
			Status  string `json:"status"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		StopReason string `json:"stop_reason"`
		Content    []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					Text         string          `json:"text"`
					Thought      bool            `json:"thought"`
					FunctionCall json.RawMessage `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	invalid := errors.New("invalid or incomplete AI response")
	if json.Unmarshal(raw, &result) != nil || (len(result.Error) != 0 && string(result.Error) != "null") {
		return "", invalid
	}
	var parts []string
	switch protocol {
	case "openai-chat":
		if len(result.Choices) == 0 {
			return "", invalid
		}
		c := result.Choices[0]
		if (c.FinishReason != "stop" && c.FinishReason != "") || c.Message.Refusal != "" || (len(c.Message.ToolCalls) > 0 && string(c.Message.ToolCalls) != "null" && string(c.Message.ToolCalls) != "[]") {
			return "", invalid
		}
		parts = append(parts, c.Message.Content)
	case "openai-responses":
		if result.Status != "completed" {
			return "", invalid
		}
		for _, output := range result.Output {
			if output.Type == "reasoning" {
				continue
			}
			if output.Type != "message" || (output.Status != "" && output.Status != "completed") {
				return "", invalid
			}
			for _, block := range output.Content {
				if block.Type != "output_text" {
					return "", invalid
				}
				parts = append(parts, block.Text)
			}
		}
	case "anthropic":
		if result.StopReason != "end_turn" {
			return "", invalid
		}
		for _, block := range result.Content {
			if block.Type == "thinking" || block.Type == "redacted_thinking" {
				continue
			}
			if block.Type != "text" {
				return "", invalid
			}
			parts = append(parts, block.Text)
		}
	case "gemini":
		if result.PromptFeedback.BlockReason != "" || len(result.Candidates) == 0 || result.Candidates[0].FinishReason != "STOP" {
			return "", invalid
		}
		for _, block := range result.Candidates[0].Content.Parts {
			if len(block.FunctionCall) > 0 && string(block.FunctionCall) != "null" {
				return "", invalid
			}
			if !block.Thought {
				parts = append(parts, block.Text)
			}
		}
	default:
		return "", invalid
	}
	text := strings.TrimSpace(strings.Join(parts, "\n"))
	if text == "" || utf8.RuneCountInString(text) > 20000 {
		return "", invalid
	}
	return text, nil
}

func (a *App) handleTestAISettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	s, ok := a.aiProbeSettings(w, r, true)
	if !ok {
		return
	}
	release, ok := a.aiLimits.acquire(currentUser(r).ID, a.now())
	if !ok {
		w.Header().Set("Retry-After", "60")
		respondError(w, 429, "AI requests are too frequent; try again later")
		return
	}
	defer release()
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	_, err := requestAIText(ctx, a.aiHTTPClient, s, "This is a synthetic connectivity test. No personal data is involved.", "Reply with just OK.")
	if err != nil {
		respondError(w, 502, aiDiagnostic(err))
		return
	}
	respondJSON(w, 200, map[string]bool{"ok": true})
}

// Accept a versioned base or a complete generation endpoint. Root URLs use the
// protocol default; custom version/prefix paths are preserved verbatim.
func aiProviderEndpoint(s aiSettings, models bool) (*url.URL, error) {
	u, err := aiEndpoint(s.BaseURL)
	if err != nil {
		return nil, err
	}
	p := strings.TrimSuffix(u.Path, "/chat/completions")
	rootURL := p == ""
	protocol := normalizeAIProtocol(s.Protocol)
	if !validAIProtocol(protocol) {
		return nil, errors.New("invalid AI protocol")
	}
	suffix := map[string]string{"openai-chat": "/chat/completions", "openai-responses": "/responses", "anthropic": "/messages"}[protocol]
	if protocol == "gemini" {
		if i := strings.LastIndex(p, "/models/"); i >= 0 && strings.HasSuffix(p, ":generateContent") {
			p = p[:i]
		}
	} else {
		p = strings.TrimSuffix(p, suffix)
	}
	if rootURL {
		if protocol == "gemini" {
			p = "/v1beta"
		} else {
			p = "/v1"
		}
	}
	if models {
		u.Path = p + "/models"
	} else if protocol == "gemini" {
		if !validGeminiModel(s.Model) {
			return nil, errors.New("invalid Gemini model ID")
		}
		u.Path = p + "/models/" + s.Model + ":generateContent"
	} else {
		u.Path = p + suffix
	}
	return u, nil
}

func setAIHeaders(req *http.Request, s aiSettings) {
	req.Header.Set("Accept", "application/json")
	switch normalizeAIProtocol(s.Protocol) {
	case "anthropic":
		req.Header.Set("x-api-key", s.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	case "gemini":
		req.Header.Set("x-goog-api-key", s.APIKey)
	default:
		req.Header.Set("Authorization", "Bearer "+s.APIKey)
	}
}

type aiSafeError string

func (e aiSafeError) Error() string { return string(e) }
func aiTransportError(err error) error {
	var ne net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &ne) && ne.Timeout() {
		return aiSafeError("AI request timed out; check server connectivity or try a faster model")
	}
	var dns *net.DNSError
	if errors.As(err, &dns) {
		return aiSafeError("AI DNS lookup failed; check provider hostname and server DNS")
	}
	return aiSafeError("AI connection failed; check server network, HTTPS certificate and public provider URL")
}
func aiStatusError(status int) error {
	hint := "check provider availability"
	switch status {
	case 400, 422:
		hint = "check API protocol, model and supported request parameters"
	case 401:
		hint = "API KEY was rejected; re-enter a valid key"
	case 402:
		hint = "check provider account balance"
	case 403:
		hint = "check key permissions, model access and provider region restrictions"
	case 404, 405:
		hint = "check Base URL, API protocol and model; this endpoint may be unsupported"
	case 408, 504:
		hint = "provider timed out; try again later or choose a faster model"
	case 429:
		hint = "check provider quota, balance and rate limits"
	}
	return aiSafeError(fmt.Sprintf("AI provider HTTP %d: %s", status, hint))
}
func aiDiagnostic(err error) string {
	var safe aiSafeError
	if errors.As(err, &safe) {
		return safe.Error()
	}
	return "AI response is empty, incomplete or incompatible; check API protocol and model, or try a non-reasoning text model"
}
