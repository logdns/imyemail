package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	feedbackTitleMaxRunes   = 120
	feedbackContentMaxRunes = 5000
	feedbackListLimit       = 100
	feedbackRequestBodyMax  = 64 << 10
)

var feedbackStatuses = map[string]bool{
	"pending":    true,
	"processing": true,
	"replied":    true,
	"closed":     true,
}

type feedbackScanner interface {
	Scan(dest ...any) error
}

func (a *App) handleListMyFeedbackTickets(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	items, err := a.listFeedbackTickets(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), user.ID, false)
	if errors.Is(err, errInvalidFeedbackStatus) {
		badRequest(w, err)
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback tickets")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleCreateFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	r.Body = http.MaxBytesReader(w, r.Body, feedbackRequestBodyMax)
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	title, content, err := normalizeFeedbackInput(req.Title, req.Content)
	if err != nil {
		badRequest(w, err)
		return
	}
	nowTime := a.now().UTC()
	limited, err := a.consumeFeedbackRateLimit(r.Context(), "create", user.ID, nowTime.Add(-time.Hour), 10, nowTime)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to check feedback rate limit")
		return
	}
	if limited {
		respondError(w, http.StatusTooManyRequests, "提交过于频繁，请稍后再试")
		return
	}

	ticketID := newID("fbt")
	messageID := newID("fbm")
	now := nowTime.Format(time.RFC3339Nano)
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create feedback ticket")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO feedback_tickets(id,user_id,title,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)`, ticketID, user.ID, title, now, now); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create feedback ticket")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO feedback_messages(id,ticket_id,author_user_id,author_role,content,created_at) VALUES(?,?,?,'user',?,?)`, messageID, ticketID, user.ID, content, now); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create feedback ticket")
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create feedback ticket")
		return
	}
	item, err := a.feedbackTicketByID(r.Context(), ticketID, user.ID, false, true)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusCreated, item)
}

func (a *App) handleGetMyFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	item, err := a.feedbackTicketByID(r.Context(), chi.URLParam(r, "id"), user.ID, false, true)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

func (a *App) handleReplyMyFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	a.replyFeedbackTicket(w, r, false)
}

func (a *App) handleCloseMyFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	r.Body = http.MaxBytesReader(w, r.Body, feedbackRequestBodyMax)
	var req struct {
		Confirm bool `json:"confirm"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	if !req.Confirm {
		badRequest(w, errors.New("confirmation required"))
		return
	}
	now := a.now().UTC().Format(time.RFC3339Nano)
	result, err := a.db.ExecContext(r.Context(), `UPDATE feedback_tickets SET status='closed',closed_at=?,updated_at=? WHERE id=? AND user_id=?`, now, now, chi.URLParam(r, "id"), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to close feedback ticket")
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	}
	item, err := a.feedbackTicketByID(r.Context(), chi.URLParam(r, "id"), user.ID, false, true)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

func (a *App) handleDeleteMyFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	a.deleteFeedbackTicket(w, r, currentUser(r).ID)
}

func (a *App) handleListAdminFeedbackTickets(w http.ResponseWriter, r *http.Request) {
	items, err := a.listFeedbackTickets(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), "", true)
	if errors.Is(err, errInvalidFeedbackStatus) {
		badRequest(w, err)
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback tickets")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleGetAdminFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	item, err := a.feedbackTicketByID(r.Context(), chi.URLParam(r, "id"), "", true, true)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

func (a *App) handleReplyAdminFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	a.replyFeedbackTicket(w, r, true)
}

func (a *App) handleUpdateAdminFeedbackStatus(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, feedbackRequestBodyMax)
	var req struct {
		Status  string `json:"status"`
		Confirm bool   `json:"confirm"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	status := strings.TrimSpace(req.Status)
	if status != "processing" && status != "closed" {
		badRequest(w, errInvalidFeedbackStatus)
		return
	}
	if status == "closed" && !req.Confirm {
		badRequest(w, errors.New("confirmation required"))
		return
	}
	now := a.now().UTC().Format(time.RFC3339Nano)
	var closedAt any
	if status == "closed" {
		closedAt = now
	}
	result, err := a.db.ExecContext(r.Context(), `UPDATE feedback_tickets SET status=?,closed_at=?,updated_at=? WHERE id=?`, status, closedAt, now, chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update feedback ticket")
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	}
	item, err := a.feedbackTicketByID(r.Context(), chi.URLParam(r, "id"), "", true, true)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusOK, item)
}

func (a *App) handleDeleteAdminFeedbackTicket(w http.ResponseWriter, r *http.Request) {
	a.deleteFeedbackTicket(w, r, "")
}

func (a *App) replyFeedbackTicket(w http.ResponseWriter, r *http.Request, admin bool) {
	actor := currentUser(r)
	r.Body = http.MaxBytesReader(w, r.Body, feedbackRequestBodyMax)
	var req struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		badRequest(w, errors.New("回复内容不能为空"))
		return
	}
	if len([]rune(content)) > feedbackContentMaxRunes {
		badRequest(w, errors.New("回复内容不能超过 5000 个字符"))
		return
	}
	nowTime := a.now().UTC()
	limited, err := a.consumeFeedbackRateLimit(r.Context(), "reply", actor.ID, nowTime.Add(-time.Minute), 30, nowTime)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to check feedback rate limit")
		return
	}
	if limited {
		respondError(w, http.StatusTooManyRequests, "回复过于频繁，请稍后再试")
		return
	}

	ticketID := chi.URLParam(r, "id")
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reply to feedback ticket")
		return
	}
	defer tx.Rollback()
	query := `SELECT status FROM feedback_tickets WHERE id=?`
	args := []any{ticketID}
	if !admin {
		query += ` AND user_id=?`
		args = append(args, actor.ID)
	}
	var currentStatus string
	if err := tx.QueryRowContext(r.Context(), query, args...).Scan(&currentStatus); errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	if currentStatus == "closed" {
		respondError(w, http.StatusConflict, "已关闭的工单不能继续回复")
		return
	}
	authorRole := "user"
	nextStatus := "pending"
	if admin {
		authorRole = "admin"
		nextStatus = "replied"
	}
	now := nowTime.Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO feedback_messages(id,ticket_id,author_user_id,author_role,content,created_at) VALUES(?,?,?,?,?,?)`, newID("fbm"), ticketID, actor.ID, authorRole, content, now); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reply to feedback ticket")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE feedback_tickets SET status=?,closed_at=NULL,updated_at=? WHERE id=?`, nextStatus, now, ticketID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reply to feedback ticket")
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reply to feedback ticket")
		return
	}
	ownerID := ""
	if !admin {
		ownerID = actor.ID
	}
	item, err := a.feedbackTicketByID(r.Context(), ticketID, ownerID, admin, true)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load feedback ticket")
		return
	}
	respondJSON(w, http.StatusCreated, item)
}

func (a *App) deleteFeedbackTicket(w http.ResponseWriter, r *http.Request, ownerID string) {
	r.Body = http.MaxBytesReader(w, r.Body, feedbackRequestBodyMax)
	var req struct {
		Confirm bool `json:"confirm"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	if !req.Confirm {
		badRequest(w, errors.New("confirmation required"))
		return
	}
	query := `DELETE FROM feedback_tickets WHERE id=?`
	args := []any{chi.URLParam(r, "id")}
	if ownerID != "" {
		query += ` AND user_id=?`
		args = append(args, ownerID)
	}
	result, err := a.db.ExecContext(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete feedback ticket")
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		respondError(w, http.StatusNotFound, "feedback ticket not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}

var errInvalidFeedbackStatus = errors.New("invalid feedback status")

func normalizeFeedbackInput(title, content string) (string, string, error) {
	title = strings.TrimSpace(title)
	content = strings.TrimSpace(content)
	if title == "" || content == "" {
		return "", "", errors.New("标题和内容不能为空")
	}
	if len([]rune(title)) > feedbackTitleMaxRunes {
		return "", "", errors.New("标题不能超过 120 个字符")
	}
	if len([]rune(content)) > feedbackContentMaxRunes {
		return "", "", errors.New("内容不能超过 5000 个字符")
	}
	return title, content, nil
}

func (a *App) consumeFeedbackRateLimit(ctx context.Context, action, userID string, since time.Time, limit int, now time.Time) (bool, error) {
	if action != "create" && action != "reply" {
		return false, errors.New("invalid feedback rate limit action")
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM feedback_rate_events WHERE created_at<?`, now.Add(-24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		return false, err
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM feedback_rate_events WHERE user_id=? AND action=? AND created_at>=?`, userID, action, since.Format(time.RFC3339Nano)).Scan(&count); err != nil {
		return false, err
	}
	if count >= limit {
		return true, nil
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO feedback_rate_events(id,user_id,action,created_at) VALUES(?,?,?,?)`, newID("fbr"), userID, action, now.Format(time.RFC3339Nano)); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return false, nil
}

func (a *App) listFeedbackTickets(ctx context.Context, status, ownerID string, admin bool) ([]FeedbackTicket, error) {
	if status == "all" {
		status = ""
	}
	if status != "" && !feedbackStatuses[status] {
		return nil, errInvalidFeedbackStatus
	}
	query := `SELECT t.id,t.user_id,u.login_name,u.email,u.display_name,t.title,t.status,
		COALESCE((SELECT content FROM feedback_messages fm WHERE fm.ticket_id=t.id ORDER BY fm.created_at DESC,fm.id DESC LIMIT 1),''),
		(SELECT COUNT(*) FROM feedback_messages fm WHERE fm.ticket_id=t.id),t.created_at,t.updated_at,t.closed_at
		FROM feedback_tickets t JOIN users u ON u.id=t.user_id WHERE 1=1`
	args := []any{}
	if ownerID != "" {
		query += ` AND t.user_id=?`
		args = append(args, ownerID)
	}
	if status != "" {
		query += ` AND t.status=?`
		args = append(args, status)
	}
	query += ` ORDER BY t.updated_at DESC,t.id DESC LIMIT ?`
	args = append(args, feedbackListLimit)
	rows, err := a.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []FeedbackTicket{}
	for rows.Next() {
		item, err := scanFeedbackTicket(rows, admin)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (a *App) feedbackTicketByID(ctx context.Context, id, ownerID string, admin, withMessages bool) (*FeedbackTicket, error) {
	query := `SELECT t.id,t.user_id,u.login_name,u.email,u.display_name,t.title,t.status,
		COALESCE((SELECT content FROM feedback_messages fm WHERE fm.ticket_id=t.id ORDER BY fm.created_at DESC,fm.id DESC LIMIT 1),''),
		(SELECT COUNT(*) FROM feedback_messages fm WHERE fm.ticket_id=t.id),t.created_at,t.updated_at,t.closed_at
		FROM feedback_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?`
	args := []any{id}
	if ownerID != "" {
		query += ` AND t.user_id=?`
		args = append(args, ownerID)
	}
	item, err := scanFeedbackTicket(a.db.QueryRowContext(ctx, query, args...), admin)
	if err != nil {
		return nil, err
	}
	if withMessages {
		messages, err := a.feedbackMessages(ctx, id)
		if err != nil {
			return nil, err
		}
		item.Messages = messages
	}
	return &item, nil
}

func scanFeedbackTicket(scanner feedbackScanner, admin bool) (FeedbackTicket, error) {
	var item FeedbackTicket
	var createdAt, updatedAt string
	var closedAt sql.NullString
	err := scanner.Scan(&item.ID, &item.UserID, &item.UserLoginName, &item.UserEmail, &item.UserDisplayName, &item.Title, &item.Status, &item.LastMessage, &item.MessageCount, &createdAt, &updatedAt, &closedAt)
	if err != nil {
		return FeedbackTicket{}, err
	}
	item.CreatedAt = parseTime(createdAt)
	item.UpdatedAt = parseTime(updatedAt)
	item.ClosedAt = nullableTime(closedAt)
	if !admin {
		item.UserID = ""
		item.UserLoginName = ""
		item.UserEmail = ""
		item.UserDisplayName = ""
	}
	return item, nil
}

func (a *App) feedbackMessages(ctx context.Context, ticketID string) ([]FeedbackMessage, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id,ticket_id,author_role,content,created_at FROM feedback_messages WHERE ticket_id=? ORDER BY created_at,id`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []FeedbackMessage{}
	for rows.Next() {
		var item FeedbackMessage
		var createdAt string
		if err := rows.Scan(&item.ID, &item.TicketID, &item.AuthorRole, &item.Content, &createdAt); err != nil {
			return nil, err
		}
		item.CreatedAt = parseTime(createdAt)
		items = append(items, item)
	}
	return items, rows.Err()
}
