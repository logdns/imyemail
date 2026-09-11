#!/bin/sh
# Build the same verified upstream release for the split and all-in-one images.
set -eu
DOVECOT_VERSION=2.4.5
DOVECOT_SOURCE_SHA256=868c2686a61b5f8e00a3e4721789b1ab46e6528fd773a5fbed07a6ecba7731e6

build_dir="$(mktemp -d)"
cd "$build_dir"
mkdir -m 0700 gnupg
export GNUPGHOME="$build_dir/gnupg"
curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 \
  https://repo.dovecot.org/DOVECOT-REPO-GPG-2.4 -o signing.key
fingerprint="$(gpg --batch --show-keys --with-colons signing.key | awk -F: '$1 == "fpr" { print $10; exit }')"
test "$fingerprint" = EF0882079FD4ED32BF8B23B2A1B09EF84EDC5219
gpg --batch --import signing.key
curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 \
  "https://dovecot.org/releases/2.4/dovecot-${DOVECOT_VERSION}.tar.gz" -o source.tar.gz
curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 \
  "https://dovecot.org/releases/2.4/dovecot-${DOVECOT_VERSION}.tar.gz.sig" -o source.tar.gz.sig
gpg --batch --verify source.tar.gz.sig source.tar.gz
printf '%s  source.tar.gz\n' "$DOVECOT_SOURCE_SHA256" | sha256sum --check --strict -
tar -xzf source.tar.gz
cd "dovecot-${DOVECOT_VERSION}"
./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var \
  --libexecdir=/usr/libexec --libdir=/usr/lib \
  --with-rundir=/run/dovecot --with-statedir=/var/lib/dovecot \
  --with-sql=yes --with-sqlite --without-mysql --without-pgsql \
  --without-ldap --without-pam --without-gssapi --without-systemd \
  --with-icu --with-sodium --with-libcap --with-pcre2 \
  --with-bzlib --with-lz4 --with-zstd --without-solr --without-flatcurve \
  --disable-static --enable-hardening=yes
make -j"${DOVECOT_BUILD_JOBS:-2}"
printf '%s\n' "$PWD" > /dovecot-source-dir
make install-strip DESTDIR=/out
rm -rf /out/usr/include /out/usr/lib/pkgconfig
mkdir -p /out/usr/share/doc/imyemail-dovecot /out/DEBIAN
cp COPYING COPYING.LGPL NEWS /out/usr/share/doc/imyemail-dovecot/
printf 'Version: %s\nSource: https://dovecot.org/releases/2.4/dovecot-%s.tar.gz\nSHA256: %s\n' \
  "$DOVECOT_VERSION" "$DOVECOT_VERSION" "$DOVECOT_SOURCE_SHA256" \
  > /out/usr/share/doc/imyemail-dovecot/SOURCE
printf 'Package: imyemail-dovecot\nVersion: %s-1\nArchitecture: %s\nMaintainer: imyemail maintainers\nDescription: Verified upstream Dovecot for imyemail containers\nDepends: libc6, libcrypt1, libssl3t64, libsqlite3-0, libicu76, libsodium23, libcap2, libpcre2-32-0, libbz2-1.0, liblz4-1, libzstd1, zlib1g, adduser\nConflicts: dovecot-core, dovecot-imapd, dovecot-pop3d, dovecot-lmtpd, dovecot-sqlite\n' \
  "$DOVECOT_VERSION" "$(dpkg --print-architecture)" > /out/DEBIAN/control
dpkg-deb --build --root-owner-group /out /imyemail-dovecot.deb
