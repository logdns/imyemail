package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
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
	endpoint, err := aiEndpoint(s.BaseURL)
	if err != nil {
		return "", err
	}
	basePath := strings.TrimSuffix(endpoint.Path, "/chat/completions")
	protocol := normalizeAIProtocol(s.Protocol)
	messages := []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": input}}
	payload := map[string]any{"model": s.Model, "stream": false, "max_tokens": 2000, "messages": messages}
	switch protocol {
	case "openai-chat":
	case "openai-responses":
		endpoint.Path = basePath + "/responses"
		payload = map[string]any{"model": s.Model, "stream": false, "store": false, "max_output_tokens": 2000, "instructions": system, "input": input}
	case "anthropic":
		endpoint.Path = basePath + "/messages"
		payload = map[string]any{"model": s.Model, "stream": false, "max_tokens": 2000, "system": system, "messages": messages[1:]}
	case "gemini":
		if !validGeminiModel(s.Model) {
			return "", errors.New("invalid Gemini model ID")
		}
		endpoint.Path = basePath + "/models/" + s.Model + ":generateContent"
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
	switch protocol {
	case "anthropic":
		req.Header.Set("x-api-key", s.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	case "gemini":
		req.Header.Set("x-goog-api-key", s.APIKey)
	default:
		req.Header.Set("Authorization", "Bearer "+s.APIKey)
	}
	res, err := client.Do(req)
	if err != nil {
		return "", errors.New("AI provider unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", errors.New("AI provider rejected request")
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
			if output.Type != "message" || output.Status != "completed" {
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
	s, err := a.loadAISettings(r.Context())
	if err != nil {
		respondError(w, 503, "AI settings unavailable")
		return
	}
	if s.BaseURL == "" || s.Model == "" || s.APIKey == "" {
		respondError(w, 400, "AI URL, key and model are required before testing")
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
	_, err = generateAIMail(ctx, a.aiHTTPClient, s, aiMailRequest{Action: "compose", Language: "en", Instruction: "Write one short greeting for a synthetic connectivity test. No personal data is involved."})
	if err != nil {
		respondError(w, 502, "AI connection test failed; check provider settings or try again later")
		return
	}
	respondJSON(w, 200, map[string]bool{"ok": true})
}
