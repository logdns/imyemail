package app

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	clientAccessEventRetention = 90 * 24 * time.Hour
	clientAccessEventMaxRows   = 100
	clientAccessEventMaxStored = 1000
)

func normalizeClientAccessProtocol(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "imap":
		return "imap"
	case "pop3":
		return "pop3"
	case "smtp", "submission":
		return "smtp"
	default:
		return ""
	}
}

func normalizeClientAccessIP(value string) string {
	value = strings.TrimSpace(value)
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	ip := net.ParseIP(strings.Trim(value, "[]"))
	if ip == nil {
		return ""
	}
	return ip.String()
}

func normalizeClientAccessText(value string, limit int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > limit {
		value = string(runes[:limit])
	}
	return value
}

func (a *App) recordClientAccessEvent(ctx context.Context, username, protocol, remoteIP, clientInfo, authMethod string, success bool) {
	protocol = normalizeClientAccessProtocol(protocol)
	address := normalizeEmail(username)
	if protocol == "" || address == "" {
		return
	}
	var userID, mailboxID string
	if err := a.db.QueryRowContext(ctx, `SELECT user_id,id FROM mailboxes WHERE address=?`, address).Scan(&userID, &mailboxID); err != nil {
		return
	}
	now := a.now().UTC()
	_, err := a.db.ExecContext(ctx, `INSERT INTO client_access_events(id,user_id,mailbox_id,protocol,remote_ip,client_info,auth_method,success,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		newID("cae"), userID, mailboxID, protocol, normalizeClientAccessIP(remoteIP), normalizeClientAccessText(clientInfo, 255), normalizeClientAccessText(authMethod, 32), boolInt(success), now.Format(time.RFC3339Nano))
	if err != nil {
		a.log.Warn("failed to record client access event", "protocol", protocol, "error", err)
		return
	}
	// A public authentication endpoint must not allow repeated failures against
	// a known address to grow the database without a per-mailbox bound.
	_, _ = a.db.ExecContext(ctx, `DELETE FROM client_access_events WHERE id IN (
		SELECT id FROM client_access_events WHERE mailbox_id=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET ?
	)`, mailboxID, clientAccessEventMaxStored)
	// Access history is diagnostic data, not an indefinite activity log.
	_, _ = a.db.ExecContext(ctx, `DELETE FROM client_access_events WHERE created_at<?`, now.Add(-clientAccessEventRetention).Format(time.RFC3339Nano))
}

func (a *App) handleClientAccessEvents(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	mailboxID := strings.TrimSpace(r.URL.Query().Get("mailboxId"))
	limit := 50
	if value := strings.TrimSpace(r.URL.Query().Get("limit")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= clientAccessEventMaxRows {
			limit = parsed
		}
	}
	args := []any{user.ID}
	where := `e.user_id=?`
	if mailboxID != "" && !isAllMailboxID(mailboxID) {
		var exists int
		if err := a.db.QueryRowContext(r.Context(), `SELECT COUNT(1) FROM mailboxes WHERE id=? AND user_id=?`, mailboxID, user.ID).Scan(&exists); err != nil || exists != 1 {
			respondError(w, http.StatusNotFound, "mailbox not found")
			return
		}
		where += ` AND e.mailbox_id=?`
		args = append(args, mailboxID)
	}
	args = append(args, limit)
	rows, err := a.db.QueryContext(r.Context(), `SELECT e.id,e.mailbox_id,m.address,e.protocol,e.remote_ip,e.client_info,e.auth_method,e.success,e.created_at
		FROM client_access_events e JOIN mailboxes m ON m.id=e.mailbox_id
		WHERE `+where+` ORDER BY e.created_at DESC,e.id DESC LIMIT ?`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load client access history")
		return
	}
	defer rows.Close()
	items := []ClientAccessEvent{}
	for rows.Next() {
		var item ClientAccessEvent
		var success int
		var created string
		if err := rows.Scan(&item.ID, &item.MailboxID, &item.Address, &item.Protocol, &item.RemoteIP, &item.ClientInfo, &item.AuthMethod, &success, &created); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to scan client access history")
			return
		}
		item.Success = intBool(success)
		item.CreatedAt = parseTime(created)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load client access history")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"items": items})
}
