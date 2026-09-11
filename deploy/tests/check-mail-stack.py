#!/usr/bin/env python3
"""Isolated all-in-one integration check; never targets a running installation.

Uses random disposable Docker names/volumes and credentials, publishes only on
loopback, and sends only to release.example.test inside the test container.
"""
import argparse
import email.message
import email.policy
import hashlib
import http.cookiejar
import imaplib
import json
import os
import poplib
import secrets
import smtplib
import socket
import ssl
import subprocess
import time
import urllib.request


def docker(*args, env=None):
    return subprocess.check_output(["docker", *args], env=env, text=True, stderr=subprocess.PIPE).strip()


def eventually(check, seconds=120):
    deadline = time.monotonic() + seconds
    while True:
        try:
            return check()
        except (AssertionError, OSError, imaplib.IMAP4.error, smtplib.SMTPException):
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--previous-image", help="Also verify old -> new -> old -> new Maildir compatibility")
    args = parser.parse_args()
    name = "imyemail-check-" + secrets.token_hex(6)
    data_volume, mail_volume = name + "-data", name + "-mail"
    password = secrets.token_urlsafe(32)
    address = "admin@release.example.test"
    # Only these newly created containers use self-signed bootstrap certificates.
    tls = ssl._create_unverified_context()
    ports = {}
    expected = {}
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def api(path, payload=None):
        request = urllib.request.Request("http://127.0.0.1:" + str(ports[80]) + path,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"})
        with opener.open(request, timeout=15) as response:
            return json.load(response)

    def start(image):
        env = dict(os.environ, IMYEMAIL_ADMIN_PASSWORD=password)
        command = ["run", "-d", "--name", name, "-e", "IMYEMAIL_ADMIN_PASSWORD",
            "-e", "IMYEMAIL_ADMIN_EMAIL=" + address,
            "-e", "IMYEMAIL_PUBLIC_HOSTNAME=mail.release.example.test",
            "-e", "IMYEMAIL_UI_TEMPLATE=imyemail-cloud-byte",
            "-e", "IMYEMAIL_PUBLIC_BASE_URL=http://localhost",
            "-v", data_volume + ":/data", "-v", mail_volume + ":/var/mail/vhosts"]
        for port in [80, 443, 25, 465, 587, 993, 995]:
            command.extend(["-p", "127.0.0.1::" + str(port)])
        docker(*command, image, env=env)
        bindings = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", name))
        ports.update({port: int(bindings[str(port) + "/tcp"][0]["HostPort"]) for port in [80, 443, 25, 465, 587, 993, 995]})
        eventually(lambda: api("/healthz"))
        api("/api/auth/login", {"loginName": address, "password": password})
        eventually(lambda: imap_login().logout())
        states = docker("exec", name, "supervisorctl", "status")
        assert all("RUNNING" in line for line in states.splitlines()), "A supervised service is not running"

    def stop():
        docker("rm", "-f", name)

    def imap_login():
        client = imaplib.IMAP4_SSL("127.0.0.1", ports[993], ssl_context=tls, timeout=15)
        client.login(address, password)
        return client

    def remember(client, folder, raw):
        assert client.append(folder, None, None, raw)[0] == "OK"
        expected[folder] = hashlib.sha256(raw).hexdigest()

    def verify_folders():
        with imap_login() as client:
            for folder, digest in expected.items():
                assert client.select(folder)[0] == "OK", folder
                status, ids = client.search(None, "ALL")
                assert status == "OK" and ids[0], folder
                status, result = client.fetch(ids[0].split()[-1], "(BODY.PEEK[])")
                assert status == "OK" and hashlib.sha256(result[0][1]).hexdigest() == digest, folder
                assert client.thread("REFERENCES", "UTF-8", "ALL")[0] == "OK"

    def message(subject):
        msg = email.message.EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = address, address, subject
        msg["Message-ID"] = "<" + secrets.token_hex(12) + "@release.example.test>"
        msg.set_content("Isolated release check. This message never leaves the test mail domain.")
        return msg

    try:
        docker("volume", "create", data_volume)
        docker("volume", "create", mail_volume)
        start(args.previous_image or args.image)
        with imap_login() as client:
            for folder in ["Release", "Release/~Legacy"]:
                assert client.create(folder)[0] == "OK"
                remember(client, folder, message("Persistent Maildir fixture").as_bytes(policy=email.policy.SMTP))
        verify_folders()
        if args.previous_image:
            stop()
            start(args.image)
        version = docker("exec", name, "dovecot", "--version")
        assert version.split()[0] == "2.4.5", version
        assert docker("exec", name, "doveconf", "-h", "dovecot_storage_version") == "2.4.5"
        docker("exec", name, "doveconf", "-n")
        docker("exec", name, "postfix", "check")
        docker("exec", name, "rspamadm", "configtest")
        verify_folders()
        # SMTP TLS, authentication and local delivery through Postfix/Rspamd/LMTP.
        for port in [25, 465, 587]:
            cls = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
            options = {"context": tls} if port == 465 else {}
            with cls("127.0.0.1", ports[port], timeout=20, **options) as client:
                client.ehlo()
                if port in [25, 587]:
                    client.starttls(context=tls)
                    client.ehlo()
                if port != 25:
                    client.login(address, password)
                assert client.send_message(message("Release protocol " + str(port))) == {}

        def delivered():
            with imap_login() as client:
                client.select("INBOX")
                for port in [25, 465, 587]:
                    assert client.search(None, "SUBJECT", '"Release protocol ' + str(port) + '"')[1][0]
        eventually(delivered)
        client = poplib.POP3_SSL("127.0.0.1", ports[995], context=tls, timeout=15)
        try:
            client.user(address)
            client.pass_(password)
            assert client.stat()[0] >= 3
            assert client.retr(1)[0].startswith(b"+OK")
        finally:
            client.quit()
        # Invalid credentials must still fail after the SQL/auth-policy rebuild.
        with imaplib.IMAP4_SSL("127.0.0.1", ports[993], ssl_context=tls, timeout=15) as client:
            try:
                client.login(address, secrets.token_urlsafe(20))
                raise AssertionError("Invalid IMAP password accepted")
            except imaplib.IMAP4.error:
                pass
        # Bounded local pre-auth ID input must not impair an independent login.
        with tls.wrap_socket(socket.create_connection(("127.0.0.1", ports[993]), timeout=10), server_hostname="localhost") as conn:
            conn.recv(4096)
            conn.sendall(b"a ID (" + b'"key" "value" ' * 2000 + b")\r\n")
            assert conn.recv(4096)
        with imap_login() as client:
            client.select("INBOX")
            assert client.noop()[0] == "OK"
        if args.previous_image:
            stop()
            start(args.previous_image)
            verify_folders()
            stop()
            start(args.image)
            verify_folders()
        print("PASS: Dovecot 2.4.5, storage version, services, SMTP TLS 25/465/587, IMAPS, POP3S, local delivery, rejected auth, bounded pre-auth ID, Maildir/thread-index compatibility.")
    finally:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for volume in [data_volume, mail_volume]:
            subprocess.run(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
