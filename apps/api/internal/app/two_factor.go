package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

type loginChallenge struct {
	ID        string
	UserID    string
	Attempts  int
	ExpiresAt time.Time
}

const maxLoginChallengeAttempts = 5

func newTOTPSecret() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

func newApplicationPassword() (string, error) {
	buf := make([]byte, 15)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)), nil
}

func totpProvisioningURI(issuer, account, secret string) string {
	issuer = strings.TrimSpace(issuer)
	account = strings.TrimSpace(account)
	secret = strings.TrimSpace(secret)
	label := url.PathEscape(issuer + ":" + account)
	return fmt.Sprintf("otpauth://totp/%s?secret=%s&issuer=%s&digits=6&period=30", label, url.QueryEscape(secret), url.QueryEscape(issuer))
}

func generateTOTP(secret string, now time.Time) (string, error) {
	key, err := decodeTOTPSecret(secret)
	if err != nil {
		return "", err
	}
	counter := now.Unix() / 30
	return generateTOTPForCounter(key, counter), nil
}

func verifyTOTP(secret, code string, now time.Time) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}
	for _, r := range code {
		if r < '0' || r > '9' {
			return false
		}
	}
	key, err := decodeTOTPSecret(secret)
	if err != nil {
		return false
	}
	counter := now.Unix() / 30
	for delta := int64(-2); delta <= 2; delta++ {
		if generateTOTPForCounter(key, counter+delta) == code {
			return true
		}
	}
	return false
}

func newRecoveryCodes(count int) ([]string, error) {
	codes := make([]string, 0, count)
	for len(codes) < count {
		buf := make([]byte, 8)
		if _, err := rand.Read(buf); err != nil {
			return nil, err
		}
		code := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf))
		codes = append(codes, code[:6]+"-"+code[6:])
	}
	return codes, nil
}

func (a *App) verifySecondFactor(ctx context.Context, userID, secret, code string, now time.Time) bool {
	if verifyTOTP(secret, code, now) {
		return true
	}
	normalized := strings.ToLower(strings.TrimSpace(code))
	if normalized == "" {
		return false
	}
	result, err := a.db.ExecContext(ctx, `DELETE FROM two_factor_recovery_codes WHERE user_id=? AND code_hash=?`, userID, hashToken(normalized))
	if err != nil {
		return false
	}
	affected, _ := result.RowsAffected()
	return affected == 1
}

func decodeTOTPSecret(secret string) ([]byte, error) {
	secret = strings.ToUpper(strings.TrimSpace(secret))
	if secret == "" {
		return nil, errors.New("empty secret")
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
}

func generateTOTPForCounter(key []byte, counter int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset : offset+4])
	value &= 0x7fffffff
	return fmt.Sprintf("%06d", value%1000000)
}

func (a *App) createLoginChallenge(ctx context.Context, userID string) (string, error) {
	token := randomToken()
	now := a.now().UTC()
	expires := now.Add(5 * time.Minute)
	_, err := a.db.ExecContext(ctx, `INSERT INTO login_challenges(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)`,
		newID("lch"), userID, hashToken(token), expires.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		return "", err
	}
	return token, nil
}

func (a *App) loginChallengeByToken(ctx context.Context, token string) (*loginChallenge, error) {
	row := a.db.QueryRowContext(ctx, `SELECT id,user_id,attempt_count,expires_at FROM login_challenges WHERE token_hash=?`, hashToken(token))
	var challenge loginChallenge
	var expires string
	if err := row.Scan(&challenge.ID, &challenge.UserID, &challenge.Attempts, &expires); err != nil {
		return nil, err
	}
	challenge.ExpiresAt = parseTime(expires)
	if !challenge.ExpiresAt.IsZero() && !challenge.ExpiresAt.After(a.now().UTC()) {
		_, _ = a.db.ExecContext(ctx, `DELETE FROM login_challenges WHERE id=?`, challenge.ID)
		return nil, errors.New("challenge expired")
	}
	return &challenge, nil
}

func (a *App) recordLoginChallengeFailure(ctx context.Context, id string) (int, error) {
	if _, err := a.db.ExecContext(ctx, `UPDATE login_challenges SET attempt_count=attempt_count+1 WHERE id=? AND attempt_count<?`, id, maxLoginChallengeAttempts); err != nil {
		return 0, err
	}
	var attempts int
	if err := a.db.QueryRowContext(ctx, `SELECT attempt_count FROM login_challenges WHERE id=?`, id).Scan(&attempts); err != nil {
		return 0, err
	}
	remaining := maxLoginChallengeAttempts - attempts
	if remaining <= 0 {
		a.deleteLoginChallenge(ctx, id)
		return 0, nil
	}
	return remaining, nil
}

func (a *App) deleteLoginChallenge(ctx context.Context, id string) {
	_, _ = a.db.ExecContext(ctx, `DELETE FROM login_challenges WHERE id=?`, id)
}

func (a *App) loadUserAuthByID(ctx context.Context, id string) (*User, string, error) {
	row := a.db.QueryRowContext(ctx, `SELECT id,login_name,email,display_name,role,disabled,two_factor_enabled,two_factor_secret,mailbox_limit_override,created_at FROM users WHERE id=?`, id)
	var u User
	var disabled, twoFactorEnabled int
	var mailboxLimitOverride sql.NullInt64
	var secret, created string
	if err := row.Scan(&u.ID, &u.LoginName, &u.Email, &u.DisplayName, &u.Role, &disabled, &twoFactorEnabled, &secret, &mailboxLimitOverride, &created); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", errNotFound
		}
		return nil, "", err
	}
	u.Disabled = intBool(disabled)
	u.TwoFactorEnabled = intBool(twoFactorEnabled)
	u.MailboxLimitOverride = intPtrFromNull(mailboxLimitOverride)
	u.CreatedAt = parseTime(created)
	if err := a.attachUserAuthorization(ctx, &u); err != nil {
		return nil, "", err
	}
	return &u, secret, nil
}

func (a *App) handleTwoFactorSetup(w http.ResponseWriter, r *http.Request) {
	if !a.configSnapshot().TwoFactorEnabled {
		respondError(w, http.StatusBadRequest, "双因素认证已关闭")
		return
	}
	user := currentUser(r)
	if user == nil {
		respondError(w, http.StatusUnauthorized, "需要登录后才能操作")
		return
	}
	current, _, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if current.TwoFactorEnabled {
		respondError(w, http.StatusBadRequest, "two-factor authentication is already enabled")
		return
	}
	secret, err := newTOTPSecret()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate secret")
		return
	}
	now := a.now().UTC().Format(time.RFC3339Nano)
	if _, err := a.db.ExecContext(r.Context(), `UPDATE users SET two_factor_secret=?, two_factor_enabled=0, updated_at=? WHERE id=?`, secret, now, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save secret")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"secret":     secret,
		"otpauthUrl": totpProvisioningURI(publicSiteName(a.configSnapshot()), current.Email, secret),
		"serverTime": a.now().UTC(),
	})
}

func (a *App) handleTwoFactorEnable(w http.ResponseWriter, r *http.Request) {
	if !a.configSnapshot().TwoFactorEnabled {
		respondError(w, http.StatusBadRequest, "双因素认证已关闭")
		return
	}
	user := currentUser(r)
	if user == nil {
		respondError(w, http.StatusUnauthorized, "需要登录后才能操作")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	current, secret, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if current.TwoFactorEnabled {
		respondJSON(w, http.StatusOK, map[string]any{"user": current})
		return
	}
	if strings.TrimSpace(secret) == "" {
		badRequest(w, errors.New("two-factor secret not set"))
		return
	}
	if !verifyTOTP(secret, req.Code, a.now().UTC()) {
		respondError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	recoveryCodes, err := newRecoveryCodes(8)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate recovery codes")
		return
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to enable two-factor authentication")
		return
	}
	defer tx.Rollback()
	now := a.now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET two_factor_enabled=1, updated_at=? WHERE id=?`, now, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to enable two-factor authentication")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM two_factor_recovery_codes WHERE user_id=?`, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to replace recovery codes")
		return
	}
	for _, code := range recoveryCodes {
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO two_factor_recovery_codes(id,user_id,code_hash,created_at) VALUES(?,?,?,?)`, newID("2rc"), user.ID, hashToken(code), now); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save recovery codes")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to enable two-factor authentication")
		return
	}
	updated, _, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"user": updated, "recoveryCodes": recoveryCodes})
}

func (a *App) handleTwoFactorDisable(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		respondError(w, http.StatusUnauthorized, "需要登录后才能操作")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	current, secret, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if !current.TwoFactorEnabled && strings.TrimSpace(secret) == "" {
		respondJSON(w, http.StatusOK, map[string]any{"user": current})
		return
	}
	if strings.TrimSpace(secret) != "" && current.TwoFactorEnabled && !a.verifySecondFactor(r.Context(), user.ID, secret, req.Code, a.now().UTC()) {
		respondError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to disable two-factor authentication")
		return
	}
	defer tx.Rollback()
	now := a.now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET two_factor_secret='', two_factor_enabled=0, updated_at=? WHERE id=?`, now, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to disable two-factor authentication")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE mailboxes SET app_password_hash='',app_password_created_at=NULL,updated_at=? WHERE user_id=?`, now, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to revoke application passwords")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM two_factor_recovery_codes WHERE user_id=?`, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to revoke recovery codes")
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to disable two-factor authentication")
		return
	}
	updated, _, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (a *App) handleCreateMailboxAppPassword(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		respondError(w, http.StatusUnauthorized, "需要登录后才能操作")
		return
	}
	current, secret, err := a.loadUserAuthByID(r.Context(), user.ID)
	if err != nil || !current.TwoFactorEnabled || strings.TrimSpace(secret) == "" {
		respondError(w, http.StatusBadRequest, "请先为账号启用双因素认证")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err)
		return
	}
	mailboxID := strings.TrimSpace(chi.URLParam(r, "id"))
	var exists int
	if err := a.db.QueryRowContext(r.Context(), `SELECT COUNT(1) FROM mailboxes WHERE id=? AND user_id=? AND status='active'`, mailboxID, user.ID).Scan(&exists); err != nil || exists != 1 {
		respondError(w, http.StatusNotFound, "mailbox not found")
		return
	}
	if !a.verifySecondFactor(r.Context(), user.ID, secret, req.Code, a.now().UTC()) {
		respondError(w, http.StatusUnauthorized, "验证码或恢复码错误")
		return
	}
	password, err := newApplicationPassword()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate application password")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to protect application password")
		return
	}
	now := a.now().UTC().Format(time.RFC3339Nano)
	if _, err := a.db.ExecContext(r.Context(), `UPDATE mailboxes SET app_password_hash=?,app_password_created_at=?,updated_at=? WHERE id=? AND user_id=?`, string(hash), now, now, mailboxID, user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save application password")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"password": password, "createdAt": parseTime(now)})
}

func (a *App) handleDeleteMailboxAppPassword(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	mailboxID := strings.TrimSpace(chi.URLParam(r, "id"))
	result, err := a.db.ExecContext(r.Context(), `UPDATE mailboxes SET app_password_hash='',app_password_created_at=NULL,updated_at=? WHERE id=? AND user_id=?`, a.now().UTC().Format(time.RFC3339Nano), mailboxID, user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to revoke application password")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		respondError(w, http.StatusNotFound, "mailbox not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true})
}
