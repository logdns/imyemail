package app

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type MailScoreResult struct {
	Domain          string                    `json:"domain"`
	Score           int                       `json:"score"`
	Grade           string                    `json:"grade"`
	CheckedAt       time.Time                 `json:"checkedAt"`
	Checks          map[string]MailScoreCheck `json:"checks"`
	Recommendations []string                  `json:"recommendations"`
}

type MailScoreCheck struct {
	OK      bool     `json:"ok"`
	Score   int      `json:"score"`
	Maximum int      `json:"maximum"`
	Message string   `json:"message"`
	Found   []string `json:"found,omitempty"`
}

func (a *App) handleMailScore(w http.ResponseWriter, r *http.Request) {
	domain, err := a.domainByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusNotFound, "domain not found")
		return
	}
	respondJSON(w, http.StatusOK, a.checkMailScore(r.Context(), domain))
}

func (a *App) checkMailScore(ctx context.Context, domain *Domain) MailScoreResult {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	resolver := net.DefaultResolver
	checks := make(map[string]MailScoreCheck)

	mx, mxErr := resolver.LookupMX(ctx, domain.Name)
	mxFound := make([]string, 0, len(mx))
	mxOK := false
	for _, item := range mx {
		host := strings.TrimSuffix(item.Host, ".")
		mxFound = append(mxFound, fmt.Sprintf("%d %s", item.Pref, host))
		if strings.EqualFold(host, strings.TrimSuffix(a.configSnapshot().PublicHostname, ".")) {
			mxOK = true
		}
	}
	checks["mx"] = scoreCheck(mxOK && mxErr == nil, 15, "MX 已指向当前邮件主机", "MX 缺失或未指向当前邮件主机", mxFound)

	rootTXT, _ := resolver.LookupTXT(ctx, domain.Name)
	spf := findTXT(rootTXT, "v=spf1")
	spfScore := 0
	spfMessage := "未找到 SPF 记录"
	if spf != "" {
		spfScore = 10
		spfMessage = "SPF 已配置，但建议以 -all 或 ~all 收尾"
		lower := strings.ToLower(spf)
		if strings.Contains(lower, " -all") || strings.Contains(lower, " ~all") {
			spfScore = 15
			spfMessage = "SPF 策略完整"
		}
	}
	checks["spf"] = MailScoreCheck{OK: spfScore == 15, Score: spfScore, Maximum: 15, Message: spfMessage, Found: nonEmptySlice(spf)}

	dkimName := domain.DKIMSelector + "._domainkey." + domain.Name
	dkimTXT, _ := resolver.LookupTXT(ctx, dkimName)
	dkim := findTXT(dkimTXT, "v=DKIM1")
	checks["dkim"] = scoreCheck(dkim != "" && strings.Contains(strings.ToLower(dkim), "p="), 15, "DKIM 公钥已发布", "DKIM 公钥缺失或不完整", nonEmptySlice(dkim))

	dmarcTXT, _ := resolver.LookupTXT(ctx, "_dmarc."+domain.Name)
	dmarc := findTXT(dmarcTXT, "v=DMARC1")
	dmarcScore := 0
	dmarcMessage := "未找到 DMARC 记录"
	if dmarc != "" {
		dmarcScore = 10
		dmarcMessage = "DMARC 已配置，但 p=none 不提供处置保护"
		lower := strings.ToLower(strings.ReplaceAll(dmarc, " ", ""))
		if strings.Contains(lower, "p=quarantine") || strings.Contains(lower, "p=reject") {
			dmarcScore = 15
			dmarcMessage = "DMARC 处置策略有效"
		}
	}
	checks["dmarc"] = MailScoreCheck{OK: dmarcScore == 15, Score: dmarcScore, Maximum: 15, Message: dmarcMessage, Found: nonEmptySlice(dmarc)}

	hostname := strings.TrimSuffix(a.configSnapshot().PublicHostname, ".")
	addresses, addressErr := resolver.LookupIPAddr(ctx, hostname)
	publicAddresses := make([]net.IP, 0, len(addresses))
	foundAddresses := make([]string, 0, len(addresses))
	for _, address := range addresses {
		foundAddresses = append(foundAddresses, address.IP.String())
		if isPublicMailIP(address.IP) {
			publicAddresses = append(publicAddresses, address.IP)
		}
	}
	checks["host"] = scoreCheck(addressErr == nil && len(publicAddresses) > 0, 10, "邮件主机解析到公网 IP", "邮件主机没有可用的公网 A/AAAA 记录", foundAddresses)

	ptrOK := false
	ptrFound := []string{}
	for _, ip := range publicAddresses {
		names, err := resolver.LookupAddr(ctx, ip.String())
		if err != nil {
			continue
		}
		for _, name := range names {
			name = strings.TrimSuffix(name, ".")
			ptrFound = append(ptrFound, name)
			if strings.EqualFold(name, hostname) {
				ptrOK = true
			}
		}
	}
	checks["ptr"] = scoreCheck(ptrOK, 10, "PTR/rDNS 与邮件主机名一致", "请让 IP 服务商把 PTR/rDNS 设置为邮件主机名", ptrFound)

	tlsOK, tlsMessage := checkSMTPStartTLS(ctx, hostname, publicAddresses)
	checks["smtpTls"] = scoreCheck(tlsOK, 10, tlsMessage, tlsMessage, nil)

	certificate := certificateStatusFromFile(a.configSnapshot())
	certificateOK := certificate.Status == "valid" && certificate.NotAfter != nil && certificate.NotAfter.After(a.now())
	certificateMessage := "未检测到覆盖邮件主机名的有效托管证书"
	if certificateOK {
		certificateMessage = fmt.Sprintf("证书有效，剩余 %d 天", certificate.DaysRemaining)
	}
	checks["certificate"] = scoreCheck(certificateOK, 10, certificateMessage, certificateMessage, nil)

	total := 0
	recommendations := []string{}
	labels := map[string]string{"mx": "修正 MX 记录", "spf": "完善 SPF 策略", "dkim": "发布 DKIM 公钥", "dmarc": "启用 DMARC quarantine/reject", "host": "配置公网 A/AAAA", "ptr": "配置 PTR/rDNS", "smtpTls": "启用 SMTP STARTTLS", "certificate": "签发并部署可信 TLS 证书"}
	for _, key := range []string{"mx", "spf", "dkim", "dmarc", "host", "ptr", "smtpTls", "certificate"} {
		check := checks[key]
		total += check.Score
		if check.Score < check.Maximum {
			recommendations = append(recommendations, labels[key])
		}
	}
	return MailScoreResult{Domain: domain.Name, Score: total, Grade: mailScoreGrade(total), CheckedAt: a.now().UTC(), Checks: checks, Recommendations: recommendations}
}

func scoreCheck(ok bool, maximum int, yes, no string, found []string) MailScoreCheck {
	message := no
	score := 0
	if ok {
		message = yes
		score = maximum
	}
	return MailScoreCheck{OK: ok, Score: score, Maximum: maximum, Message: message, Found: found}
}

func findTXT(records []string, prefix string) string {
	prefix = strings.ToLower(prefix)
	for _, record := range records {
		if strings.Contains(strings.ToLower(record), prefix) {
			return record
		}
	}
	return ""
}

func nonEmptySlice(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return []string{value}
}

func mailScoreGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 70:
		return "C"
	case score >= 60:
		return "D"
	default:
		return "F"
	}
}

func isPublicMailIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return false
	}
	for _, cidr := range []string{
		"100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24",
		"198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4",
		"64:ff9b:1::/48", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16",
		"3fff::/20", "5f00::/16",
	} {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil && network.Contains(ip) {
			return false
		}
	}
	return true
}

func checkSMTPStartTLS(ctx context.Context, hostname string, addresses []net.IP) (bool, string) {
	if len(addresses) == 0 {
		return false, "没有公网 IP，跳过 SMTP TLS 检测"
	}
	for _, address := range addresses {
		if checkSMTPStartTLSAddress(ctx, hostname, address) {
			return true, "SMTP STARTTLS 与证书验证正常"
		}
		if ctx.Err() != nil {
			break
		}
	}
	return false, "所有公网地址的 SMTP STARTTLS 连接或证书验证均失败"
}

func checkSMTPStartTLSAddress(ctx context.Context, hostname string, address net.IP) bool {
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(address.String(), "25"))
	if err != nil {
		return false
	}
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(6 * time.Second))
	client, err := smtp.NewClient(connection, hostname)
	if err != nil {
		return false
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); !ok {
		return false
	}
	if err := client.StartTLS(&tls.Config{ServerName: hostname, MinVersion: tls.VersionTLS12}); err != nil {
		return false
	}
	return true
}
