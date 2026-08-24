# imyemail

imyemail is a self-hosted mail platform with Webmail, an administration console, and standard mail protocol services. It bundles Go, Rust, React, Postfix, Dovecot, Rspamd, and SQLite into an all-in-one Docker deployment.

<a href="https://www.buymeacoffee.com/logdns"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me a Coffee" width="217" /></a>

[Feature guide (Chinese)](docs/FEATURES.md) · [UI templates (Chinese)](docs/UI-TEMPLATES.md) · [Changelog](CHANGELOG.md) · [Releases](https://github.com/logdns/imyemail/releases) · [Architecture](docs/ARCHITECTURE.md) · [Development standard (Chinese)](docs/DEVELOPMENT.md) · [Operations guide (Chinese)](docs/OPERATIONS.md) · [Chinese README](README.md)

## Features

- Webmail with threaded reading, compose/reply/forward, drafts, attachments, direct image uploads to “My Gallery”, search, labels, folders, reminders, import, and export
- Immediate and scheduled delivery, retryable send queues, delivery status, and SMTP relay support
- Multiple domains and mailboxes, quotas, per-mailbox attachment limits, mailbox applications, verified forwarding, and external IMAP accounts
- Ordered incoming rules for moving, marking, deleting, or forwarding matching messages
- Administration for users, permission groups, domains, DNS checks, mail-health scoring, mail/account/usage statistics, aliases, messages, queues, global announcements, a three-language default, UI templates, and system settings
- Postfix, Dovecot, Rspamd, DKIM, SMTP Submission, IMAP SSL, and POP3 SSL
- Standard TOTP 2FA, one-time recovery codes, per-mailbox client app passwords, Turnstile, scoped API tokens, signed webhooks, SSRF protections, ACME certificates, backup, diagnosis, update, and rollback tooling

The admin console can issue and renew certificates through ACME HTTP-01 and automatically reload Web, Postfix, and Dovecot. ZeroSSL and Google Trust Services require EAB credentials. Domain mail-health scoring checks MX, SPF, DKIM, DMARC, public host addresses, PTR/rDNS, SMTP STARTTLS, and certificate validity.

The [feature guide](docs/FEATURES.md) maps each capability to its UI entry and documents protocol, security, update, rollback, backup, and deployment boundaries. See the [changelog](CHANGELOG.md) for version-by-version changes.

## Recent additions

- `v1.3.19`: a responsive, three-language `imyemail-vbena` template for sign-in, Webmail, profiles, and administration, including dark and reduced-motion modes.
- `v1.3.18`: a responsive `imyemail-cloud-sy` UI template for sign-in, Webmail, profiles, and administration, including dark and reduced-motion modes.
- `v1.3.17`: a clear post-install summary for the public URL, initial administrator username, secure password retrieval, and persistent data directory.
- `v1.3.16`: fixes untranslated Simplified Chinese placeholders in the composer, signatures, automatic replies, and feedback forms when using English or Traditional Chinese.
- `v1.3.15`: an administrator-controlled default language for Simplified Chinese, Traditional Chinese, and English across sign-in, Webmail, profile, and administration.
- `v1.3.11`: SMTP/IMAP/POP3 connection history with batch deletion, system-wide usage analytics, and “My Gallery” uploads.

## One-command install

Debian and Ubuntu on `amd64` or `arm64` are supported.

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh | sudo bash
```

The bootstrap downloads the Linux amd64/arm64 Rust manager and its matching SHA-256 file from a GitHub Release. The manager configures `/opt/imyemail`, installs Docker from Debian/Ubuntu system packages when needed, starts the services, and waits for the health check. It does not execute Docker's remote convenience script.

After a successful install, the manager prints the public URL, initial administrator username, secure password retrieval guidance, and persistent data directory. A password entered interactively is never echoed again. When the password is left blank, or omitted in unattended installation, a random password is stored with mode `0600` in `/opt/imyemail/.initial-admin-password`; retrieve it as instructed and delete the file after the first login. The initial administrator is only a login account—no mailbox or mail domain is created automatically. DNS records and provider port restrictions must still be configured by the operator.

## Update

System administrators can open the version dialog to review and install a GitHub release, inspect the previous rollback point, or roll back after a second confirmation. The API returns `202 Accepted` before the application container is restarted; an internal authenticated Operator then creates the backup and rollback point and invokes Watchtower asynchronously.

The Operator and Watchtower expose no host ports. A rollback switches the image and Compose definition only; it creates a fresh SQLite backup first but does not rewind database contents. Deployments created before the Operator was introduced must run `sudo imyemail update` once to refresh Compose.

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

`imyemail backup` is a SQLite-only online backup. Full disaster recovery and migration must preserve `.env`, `data`, `mail`, and `dkim` together; see the [operations guide](docs/OPERATIONS.md).

## Required ports

Open TCP ports `25`, `80`, `443`, `465`, `587`, `993`, and `995` as needed. Public delivery also requires correct MX, SPF, DKIM, and DMARC records.

Third-party clients must use the full email address as the username. Use SMTP `465` with implicit TLS or `587` with STARTTLS (`AUTH PLAIN` and `AUTH LOGIN` are supported), IMAP TLS on `993`, or POP3 TLS on `995`. When 2FA is enabled, use the per-mailbox application password for all three protocols. Recent authentication results can be selected and batch-deleted under **Account settings → Notifications & clients**.

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
