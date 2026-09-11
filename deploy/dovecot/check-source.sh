#!/bin/sh
set -eu
source_dir="$(cat /dovecot-source-dir)"
cd "$source_dir"
if ! make -j"${DOVECOT_BUILD_JOBS:-2}" check; then
  find "$source_dir/src" -name test-suite.log -exec cat {} +
  exit 1
fi
