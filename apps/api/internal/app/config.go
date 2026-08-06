package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Addr                            string
	AppVersion                      string
	DBPath                          string
	DBSharedGID                     int
	DataDir                         string
	CookieName                      string
	SessionTTLHours                 int
	AdminUsername                   string
	AdminEmail                      string
	AdminPassword                   string
	SiteName                        string
	SiteTitle                       string
	PublicHostname                  string
	PublicBaseURL                   string
	SMTPHost                        string
	SMTPPort                        string
	SMTPUsername                    string
	SMTPPassword                    string
	SMTPRequireTLS                  bool
	SubmissionAddr                  string
	SubmissionTLSAddr               string
	SubmissionMaxMessageMB          int
	TLSCertFile                     string
	TLSKeyFile                      string
	CertificateDir                  string
	CertificateAutoEnabled          bool
	CertificateProvider             string
	CertificateEmail                string
	CertificateEABKID               string
	CertificateEABHMAC              string
	CertificateRenewBeforeDays      int
	MaildirRoot                     string
	MaildirScanSeconds              int
	AllowInsecureHTTP               bool
	OpenRegistration                bool
	TwoFactorEnabled                bool
	TurnstileEnabled                bool
	TurnstileSiteKey                string
	TurnstileSecretKey              string
	CatchAllEnabled                 bool
	MailAutoRefresh                 bool
	MailRefreshSeconds              int
	UserMailboxApplyEnabled         bool
	UserMailboxDomainIDs            string
	ReservedMailboxPrefixes         string
	ExternalIMAPEnabled             bool
	ExternalIMAPSecretKey           string
	ExternalIMAPSyncSeconds         int
	ExternalIMAPAllowPrivateHosts   bool
	ExternalIMAPGmailClientID       string
	ExternalIMAPGmailClientSecret   string
	ExternalIMAPOutlookClientID     string
	ExternalIMAPOutlookClientSecret string
	MailTranslateEnabled            bool
	MailTranslateMaxChars           int
	DeliveryWebhookSecret           string
	StatusWebhookURL                string
	StatusWebhookSecret             string
	StatusWebhookAllowPrivateHosts  bool
	ReleaseAPIURL                   string
	UpdateServiceURL                string
	UpdateServiceToken              string
}

func LoadConfig() Config {
	dataDir := getenv("IMYEMAIL_DATA_DIR", "./data")
	return Config{
		Addr:                            getenv("IMYEMAIL_ADDR", ":8080"),
		AppVersion:                      getenv("IMYEMAIL_APP_VERSION", BuildVersion),
		DBPath:                          getenv("IMYEMAIL_DB_PATH", filepath.Join(dataDir, "imyemail.db")),
		DBSharedGID:                     getenvInt("IMYEMAIL_DB_SHARED_GID", -1),
		DataDir:                         dataDir,
		CookieName:                      getenv("IMYEMAIL_COOKIE_NAME", "imyemail_session"),
		SessionTTLHours:                 getenvInt("IMYEMAIL_SESSION_TTL_HOURS", 24*7),
		AdminUsername:                   normalizeLoginName(getenv("IMYEMAIL_ADMIN_USERNAME", "")),
		AdminEmail:                      strings.ToLower(getenv("IMYEMAIL_ADMIN_EMAIL", "admin@imyemail.local")),
		AdminPassword:                   getenv("IMYEMAIL_ADMIN_PASSWORD", ""),
		SiteName:                        getenv("IMYEMAIL_SITE_NAME", "imyemail"),
		SiteTitle:                       getenv("IMYEMAIL_SITE_TITLE", "imyemail"),
		PublicHostname:                  getenv("IMYEMAIL_PUBLIC_HOSTNAME", "mail.imyemail.local"),
		PublicBaseURL:                   getenv("IMYEMAIL_PUBLIC_BASE_URL", "http://localhost:5173"),
		SMTPHost:                        getenv("IMYEMAIL_SMTP_HOST", ""),
		SMTPPort:                        getenv("IMYEMAIL_SMTP_PORT", "25"),
		SMTPUsername:                    getenv("IMYEMAIL_SMTP_USERNAME", ""),
		SMTPPassword:                    getenv("IMYEMAIL_SMTP_PASSWORD", ""),
		SMTPRequireTLS:                  getenvBool("IMYEMAIL_SMTP_REQUIRE_TLS", false),
		SubmissionAddr:                  getenv("IMYEMAIL_SUBMISSION_ADDR", ""),
		SubmissionTLSAddr:               getenv("IMYEMAIL_SUBMISSION_TLS_ADDR", ""),
		SubmissionMaxMessageMB:          getenvInt("IMYEMAIL_SUBMISSION_MAX_MESSAGE_MB", 35),
		TLSCertFile:                     getenv("IMYEMAIL_TLS_CERT_FILE", ""),
		TLSKeyFile:                      getenv("IMYEMAIL_TLS_KEY_FILE", ""),
		CertificateDir:                  getenv("IMYEMAIL_CERTIFICATE_DIR", filepath.Join(dataDir, "certificates")),
		CertificateAutoEnabled:          getenvBool("IMYEMAIL_CERTIFICATE_AUTO_ENABLED", false),
		CertificateProvider:             getenv("IMYEMAIL_CERTIFICATE_PROVIDER", "letsencrypt"),
		CertificateEmail:                getenv("IMYEMAIL_CERTIFICATE_EMAIL", ""),
		CertificateEABKID:               getenv("IMYEMAIL_CERTIFICATE_EAB_KID", ""),
		CertificateEABHMAC:              getenv("IMYEMAIL_CERTIFICATE_EAB_HMAC", ""),
		CertificateRenewBeforeDays:      getenvInt("IMYEMAIL_CERTIFICATE_RENEW_BEFORE_DAYS", 30),
		MaildirRoot:                     getenv("IMYEMAIL_MAILDIR_ROOT", ""),
		MaildirScanSeconds:              getenvInt("IMYEMAIL_MAILDIR_SCAN_SECONDS", 30),
		AllowInsecureHTTP:               getenvBool("IMYEMAIL_ALLOW_INSECURE_HTTP", true),
		OpenRegistration:                getenvBool("IMYEMAIL_OPEN_REGISTRATION", false),
		TwoFactorEnabled:                getenvBool("IMYEMAIL_TWO_FACTOR_ENABLED", false),
		TurnstileEnabled:                getenvBool("IMYEMAIL_TURNSTILE_ENABLED", false),
		TurnstileSiteKey:                getenv("IMYEMAIL_TURNSTILE_SITE_KEY", ""),
		TurnstileSecretKey:              getenv("IMYEMAIL_TURNSTILE_SECRET_KEY", ""),
		CatchAllEnabled:                 getenvBool("IMYEMAIL_CATCH_ALL_ENABLED", false),
		MailAutoRefresh:                 getenvBool("IMYEMAIL_MAIL_AUTO_REFRESH", true),
		MailRefreshSeconds:              getenvInt("IMYEMAIL_MAIL_REFRESH_SECONDS", 30),
		UserMailboxApplyEnabled:         getenvBool("IMYEMAIL_USER_MAILBOX_APPLY_ENABLED", false),
		UserMailboxDomainIDs:            getenv("IMYEMAIL_USER_MAILBOX_DOMAIN_IDS", ""),
		ReservedMailboxPrefixes:         getenv("IMYEMAIL_RESERVED_MAILBOX_PREFIXES", "admin,postmaster,abuse,hostmaster,webmaster,root,security,noreply,no-reply,mailer-daemon"),
		ExternalIMAPEnabled:             getenvBool("IMYEMAIL_EXTERNAL_IMAP_ENABLED", false),
		ExternalIMAPSecretKey:           getenv("IMYEMAIL_EXTERNAL_IMAP_SECRET_KEY", ""),
		ExternalIMAPSyncSeconds:         getenvInt("IMYEMAIL_EXTERNAL_IMAP_SYNC_SECONDS", 300),
		ExternalIMAPAllowPrivateHosts:   getenvBool("IMYEMAIL_EXTERNAL_IMAP_ALLOW_PRIVATE_HOSTS", false),
		ExternalIMAPGmailClientID:       getenv("IMYEMAIL_EXTERNAL_IMAP_GMAIL_CLIENT_ID", ""),
		ExternalIMAPGmailClientSecret:   getenv("IMYEMAIL_EXTERNAL_IMAP_GMAIL_CLIENT_SECRET", ""),
		ExternalIMAPOutlookClientID:     getenv("IMYEMAIL_EXTERNAL_IMAP_OUTLOOK_CLIENT_ID", ""),
		ExternalIMAPOutlookClientSecret: getenv("IMYEMAIL_EXTERNAL_IMAP_OUTLOOK_CLIENT_SECRET", ""),
		MailTranslateEnabled:            getenvBool("IMYEMAIL_MAIL_TRANSLATE_ENABLED", true),
		MailTranslateMaxChars:           getenvInt("IMYEMAIL_MAIL_TRANSLATE_MAX_CHARS", 8000),
		DeliveryWebhookSecret:           getenv("IMYEMAIL_DELIVERY_WEBHOOK_SECRET", ""),
		StatusWebhookURL:                getenv("IMYEMAIL_STATUS_WEBHOOK_URL", ""),
		StatusWebhookSecret:             getenv("IMYEMAIL_STATUS_WEBHOOK_SECRET", ""),
		StatusWebhookAllowPrivateHosts:  getenvBool("IMYEMAIL_STATUS_WEBHOOK_ALLOW_PRIVATE_HOSTS", false),
		ReleaseAPIURL:                   getenv("IMYEMAIL_RELEASE_API_URL", "https://api.github.com/repos/logdns/imyemail/releases/latest"),
		UpdateServiceURL:                getenv("IMYEMAIL_UPDATE_SERVICE_URL", ""),
		UpdateServiceToken:              getenv("IMYEMAIL_UPDATE_SERVICE_TOKEN", ""),
	}
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getenvBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func getenvInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	var n int
	_, err := fmt.Sscanf(v, "%d", &n)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
