package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode"
)

// Draft credentials are request-scoped. Empty settings retain the legacy saved
// configuration probe. A saved key may only be reused for the same URL/protocol.
func (a *App) aiProbeSettings(w http.ResponseWriter, r *http.Request, needsModel bool) (aiSettings, bool) {
	s, err := a.loadAISettings(r.Context())
	if err != nil {
		respondError(w, 503, "AI settings unavailable")
		return s, false
	}
	var body struct {
		Settings *struct {
			Protocol    string `json:"protocol"`
			BaseURL     string `json:"baseUrl"`
			Model       string `json:"model"`
			APIKey      string `json:"apiKey"`
			ClearAPIKey bool   `json:"clearApiKey"`
		} `json:"settings"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	// Empty bodies remain supported for older clients.
	raw, readErr := io.ReadAll(r.Body)
	if readErr != nil || len(raw) > 0 && json.Unmarshal(raw, &body) != nil {
		respondError(w, 400, "invalid AI settings")
		return s, false
	}
	if body.Settings != nil {
		draft := body.Settings
		next := aiSettings{Protocol: normalizeAIProtocol(draft.Protocol), BaseURL: strings.TrimRight(strings.TrimSpace(draft.BaseURL), "/"), Model: strings.TrimSpace(draft.Model), APIKey: strings.TrimSpace(draft.APIKey)}
		if draft.ClearAPIKey && next.APIKey != "" {
			respondError(w, 400, "cannot replace and clear AI key together")
			return s, false
		}
		if next.APIKey == "" && !draft.ClearAPIKey {
			if s.APIKey != "" && (next.BaseURL != s.BaseURL || next.Protocol != normalizeAIProtocol(s.Protocol)) {
				respondError(w, 400, "re-enter or clear AI key when changing provider URL")
				return s, false
			}
			next.APIKey = s.APIKey
		}
		s = next
	}
	if !validAIProtocol(s.Protocol) {
		respondError(w, 400, "invalid AI protocol")
		return s, false
	}
	if len(s.APIKey) > 4096 || strings.ContainsAny(s.APIKey, "\r\n\x00") || len(s.Model) > 200 || strings.ContainsAny(s.Model, "\r\n\x00") {
		respondError(w, 400, "invalid AI model or key")
		return s, false
	}
	if s.BaseURL == "" || s.APIKey == "" || needsModel && s.Model == "" {
		respondError(w, 400, "AI URL and key are required; testing also requires a model")
		return s, false
	}
	if _, err := aiProviderEndpoint(s, !needsModel); err != nil {
		respondError(w, 400, err.Error())
		return s, false
	}
	return s, true
}

func (a *App) handleAIModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	s, ok := a.aiProbeSettings(w, r, false)
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
	models, truncated, err := fetchAIModels(ctx, a.aiHTTPClient, s)
	if err != nil {
		respondError(w, 502, aiDiagnostic(err))
		return
	}
	respondJSON(w, 200, map[string]any{"models": models, "truncated": truncated})
}

func fetchAIModels(ctx context.Context, client *http.Client, s aiSettings) ([]string, bool, error) {
	endpoint, err := aiProviderEndpoint(s, true)
	if err != nil {
		return nil, false, err
	}
	protocol := normalizeAIProtocol(s.Protocol)
	q := endpoint.Query()
	if protocol == "gemini" {
		q.Set("pageSize", "1000")
	}
	if protocol == "anthropic" {
		q.Set("limit", "1000")
	}
	endpoint.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint.String(), nil)
	if err != nil {
		return nil, false, aiSafeError("AI model list request is invalid")
	}
	setAIHeaders(req, s)
	res, err := client.Do(req)
	if err != nil {
		return nil, false, aiTransportError(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, false, aiStatusError(res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 {
		return nil, false, aiSafeError("AI model list is too large or unreadable; enter a model manually")
	}
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Models []struct {
			Name    string   `json:"name"`
			Methods []string `json:"supportedGenerationMethods"`
		} `json:"models"`
		Next    string          `json:"nextPageToken"`
		HasMore bool            `json:"has_more"`
		Error   json.RawMessage `json:"error"`
	}
	if json.Unmarshal(raw, &result) != nil || len(result.Error) > 0 && string(result.Error) != "null" || protocol == "gemini" && result.Models == nil || protocol != "gemini" && result.Data == nil {
		return nil, false, aiSafeError("AI model list is unsupported or incompatible; check protocol or enter a model manually")
	}
	models := make([]string, 0)
	seen := map[string]bool{}
	truncated := result.HasMore || result.Next != ""
	add := func(id string) {
		if id == "" || len(id) > 200 || strings.TrimSpace(id) != id || strings.IndexFunc(id, unicode.IsControl) >= 0 || seen[id] {
			return
		}
		if len(models) >= 1000 {
			truncated = true
			return
		}
		seen[id] = true
		models = append(models, id)
	}
	if protocol == "gemini" {
		for _, m := range result.Models {
			for _, method := range m.Methods {
				if method == "generateContent" {
					id := strings.TrimPrefix(m.Name, "models/")
					if validGeminiModel(id) {
						add(id)
					}
					break
				}
			}
		}
	} else {
		for _, m := range result.Data {
			add(m.ID)
		}
	}
	sort.Strings(models)
	return models, truncated, nil
}
