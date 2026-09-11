#!/bin/sh
set -eu
source_dir="$(cat /dovecot-source-dir)"
chmod 0755 "$(dirname "$source_dir")"
chown -R nobody:nogroup "$source_dir"
cd "$source_dir"
# Upstream explicitly checks that mode-000 files cannot be read; root bypasses
# that assertion. Run the complete suite as an unprivileged build-only user.
if ! runuser -u nobody -- make -j"${DOVECOT_BUILD_JOBS:-2}" check; then
  find "$source_dir/src" -name test-suite.log -exec cat {} +
  exit 1
fi
