package app

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

type Announcement struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Level     string    `json:"level"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *App) handleCurrentAnnouncement(w http.ResponseWriter, r *http.Request) {
	var item Announcement
	var active int
	var created, updated string
	err := a.db.QueryRowContext(r.Context(), `SELECT id,title,content,level,active,created_at,updated_at FROM announcements WHERE active=1 ORDER BY updated_at DESC LIMIT 1`).Scan(&item.ID, &item.Title, &item.Content, &item.Level, &active, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		respondJSON(w, http.StatusOK, map[string]any{"announcement": nil})
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load announcement")
		return
	}
	item.Active, item.CreatedAt, item.UpdatedAt = intBool(active), parseTime(created), parseTime(updated)
	respondJSON(w, http.StatusOK, map[string]any{"announcement": item})
}

func (a *App) handleAdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT id,title,content,level,active,created_at,updated_at FROM announcements ORDER BY updated_at DESC LIMIT 50`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load announcements")
		return
	}
	defer rows.Close()
	items := []Announcement{}
	for rows.Next() {
		var item Announcement
		var active int
		var created, updated string
		if err := rows.Scan(&item.ID, &item.Title, &item.Content, &item.Level, &active, &created, &updated); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to scan announcements")
			return
		}
		item.Active, item.CreatedAt, item.UpdatedAt = intBool(active), parseTime(created), parseTime(updated)
		items = append(items, item)
	}
	respondJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handlePublishAnnouncement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Level   string `json:"level"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	req.Title, req.Content, req.Level = strings.TrimSpace(req.Title), strings.TrimSpace(req.Content), strings.TrimSpace(req.Level)
	if req.Title == "" || req.Content == "" {
		badRequest(w, errors.New("title and content are required"))
		return
	}
	if len([]rune(req.Title)) > 120 || len([]rune(req.Content)) > 4000 {
		badRequest(w, errors.New("announcement is too long"))
		return
	}
	if req.Level != "info" && req.Level != "warning" && req.Level != "critical" {
		req.Level = "info"
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish announcement")
		return
	}
	defer tx.Rollback()
	now := a.now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(r.Context(), `UPDATE announcements SET active=0,updated_at=? WHERE active=1`, now); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to replace announcement")
		return
	}
	id := newID("ann")
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO announcements(id,title,content,level,active,created_by,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)`, id, req.Title, req.Content, req.Level, currentUser(r).ID, now, now); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish announcement")
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish announcement")
		return
	}
	a.handleCurrentAnnouncement(w, r)
}

func (a *App) handleClearAnnouncement(w http.ResponseWriter, r *http.Request) {
	_, err := a.db.ExecContext(r.Context(), `UPDATE announcements SET active=0,updated_at=? WHERE active=1`, a.now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to clear announcement")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}
