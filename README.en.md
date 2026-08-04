# imyemail

imyemail is a self-hosted mail platform with Webmail, an administration console, and standard mail protocol services. It bundles Go, Rust, React, Postfix, Dovecot, Rspamd, and SQLite into an all-in-one Docker deployment.

[Releases](https://github.com/logdns/imyemail/releases) · [Operations guide (Chinese)](docs/OPERATIONS.md) · [Chinese README](README.md)

## Upstream and fork origin

This maintained fork/derivative is based on:

- Backup/source snapshot: https://github.com/zxyszx/NewSzxcn-Email-backup
- Original upstream: https://github.com/LanQin996/LanQin-Email

The maintained repository is https://github.com/logdns/imyemail. The original MIT copyright notice remains intact; see [NOTICE.md](NOTICE.md).

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

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) for upstream attribution.

## Migrating an older deployment

Brand identifiers have been migrated to `imyemail`: environment variables use the `IMYEMAIL_` prefix, the default SQLite file is `imyemail.db`, and cookies, container services, binaries, and webhook headers use the new names. Back up `.env`, SQLite, Maildir, attachments, and DKIM keys before upgrading, then follow [deploy/README.md](deploy/README.md); do not overwrite an existing data directory with the new defaults.
