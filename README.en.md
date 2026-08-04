# imyemail

imyemail is a self-hosted mail platform with Webmail, an administration console, and standard mail protocol services. It bundles Go, Rust, React, Postfix, Dovecot, Rspamd, and SQLite into an all-in-one Docker deployment.

[Releases](https://github.com/logdns/imyemail/releases) · [Architecture](docs/ARCHITECTURE.md) · [Operations guide (Chinese)](docs/OPERATIONS.md) · [Chinese README](README.md)

## Features

- Webmail with threaded reading, compose/reply/forward, drafts, attachments, search, labels, folders, reminders, import, and export
- Immediate and scheduled delivery, retryable send queues, delivery status, and SMTP relay support
- Multiple domains and mailboxes, quotas, mailbox applications, verified forwarding, and external IMAP accounts
- Ordered incoming rules for moving, marking, deleting, or forwarding matching messages
- Administration for users, permission groups, domains, DNS checks, mail-health scoring, aliases, messages, queues, templates, and system settings
- Postfix, Dovecot, Rspamd, DKIM, SMTP Submission, IMAP SSL, and POP3 SSL
- 2FA, Turnstile, scoped API tokens, signed webhooks, SSRF protections, ACME certificates from Let's Encrypt, ZeroSSL, or Google Trust Services, backup, diagnosis, update, and rollback tooling

The admin console can issue and renew certificates through ACME HTTP-01 and automatically reload Web, Postfix, and Dovecot. ZeroSSL and Google Trust Services require EAB credentials. Domain mail-health scoring checks MX, SPF, DKIM, DMARC, public host addresses, PTR/rDNS, SMTP STARTTLS, and certificate validity.

## One-command install

Debian and Ubuntu on `amd64` or `arm64` are supported.

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh | sudo bash
```

The bootstrap downloads the Linux amd64/arm64 Rust manager and its matching SHA-256 file from a GitHub Release. The manager configures `/opt/imyemail`, installs Docker from Debian/Ubuntu system packages when needed, starts the services, and waits for the health check. It does not execute Docker's remote convenience script. DNS records and provider port restrictions must still be configured by the operator.

## Update

System administrators can click the version badge in the admin sidebar to review and install a GitHub release. The updater is only reachable on the internal Docker network.

CLI update and rollback:

```bash
sudo imyemail update
sudo imyemail rollback
```

Useful commands:

```bash
sudo imyemail self-update
sudo imyemail backup
sudo imyemail doctor
sudo imyemail status
sudo imyemail logs
sudo imyemail start
sudo imyemail stop
sudo imyemail restart
sudo imyemail uninstall
```

The default uninstall removes containers and the manager command while preserving configuration, messages, keys, backups, and the database under `/opt/imyemail`. Use `--keep-command` to retain the manager. `uninstall --purge` permanently removes the installation directory and must only be used after copying backups elsewhere.

## Required ports

Open TCP ports `25`, `80`, `443`, `465`, `587`, `993`, and `995` as needed. Public delivery also requires correct MX, SPF, DKIM, and DMARC records.

## Manual source deployment

```bash
git clone https://github.com/logdns/imyemail.git
cd imyemail/deploy
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## License

[MIT](LICENSE).

## Project origin

This project is maintained from the following upstream repositories:

- Original upstream project: https://github.com/LanQin996/LanQin-Email
- Source and backup snapshot: https://github.com/zxyszx/NewSzxcn-Email-backup

Current maintenance and release repository: https://github.com/logdns/imyemail

The upstream copyright notice and MIT license text remain in [LICENSE](LICENSE).
