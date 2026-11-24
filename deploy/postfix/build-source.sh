#!/bin/sh
set -eu

version=3.11.8
revision=1
pool=https://deb.debian.org/debian/pool/main/p/postfix
upstream=https://postfix.mirrors.ovh.net/postfix-release
name=postfix_${version}-${revision}
cd "$(mktemp -d)"
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends build-essential ca-certificates curl gnupg
for file in "$name.dsc" "postfix_$version.orig.tar.gz" "postfix_$version.orig.tar.gz.asc" "$name.debian.tar.xz"; do
    curl -fsSL --retry 4 "$pool/$file" -o "$file"
done
# Pin the Debian packaging as well as the upstream archive referenced by the .dsc.
echo "fd011547b9641d1efda3b4cde3522643ad5edeceaf541c2a7cfdff2ea6a29472  $name.dsc" | sha256sum -c -
echo "244bca208c86f678ad0a72ff1f744ec8ef922ccf3310851f6c992ff44bb5b4ff  postfix_$version.orig.tar.gz" | sha256sum -c -
curl -fsSL --retry 4 "$upstream/wietse.pgp" -o release-key
echo "f4f036962e3b4007b3489bb0388d427f4e42598d5ab4d5f1ec12405829495c88  release-key" | sha256sum -c -
curl -fsSL --retry 4 "$upstream/official/postfix-$version.tar.gz.gpg2" -o source.sig
gpg --batch --import release-key
gpg --batch --status-fd 1 --verify source.sig "postfix_$version.orig.tar.gz" >signature.status
grep -F '[GNUPG:] VALIDSIG 622C7C012254C186677469C50C0B590E80CA15A7 ' signature.status
awk '/^Checksums-Sha256:/ { hashes=1; next } hashes && /^ / { print $1 "  " $3; next } { hashes=0 }' "$name.dsc" | sha256sum --check --strict -
dpkg-source --no-check -x "$name.dsc" source
apt-get build-dep -y --no-install-recommends "./$name.dsc"
cd source
# Trixie provides the supported 1.x MongoDB driver under its original pkg-config name.
pkgconf --exists libmongoc-1.0
sed -i 's/ mongoc2)/ libmongoc-1.0)/g' debian/rules
DEB_BUILD_OPTIONS="parallel=2" dpkg-buildpackage -B -us -uc
arch=$(dpkg --print-architecture)
mkdir -p /out
cp "../${name}_${arch}.deb" /out/postfix.deb
cp "../postfix-sqlite_${version}-${revision}_${arch}.deb" /out/postfix-sqlite.deb
