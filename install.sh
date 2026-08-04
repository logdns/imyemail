#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="${IMYEMAIL_REPOSITORY:-logdns/imyemail}"
VERSION="${IMYEMAIL_VERSION:-latest}"
MANAGER_PATH="${IMYEMAIL_MANAGER_PATH:-/usr/local/bin/imyemail}"
LOCAL_MANAGER="${IMYEMAIL_MANAGER_BINARY:-}"

fail() { printf '\033[1;31m[错误]\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[1;34m[imyemail]\033[0m %s\n' "$*"; }

[[ "${EUID}" -eq 0 ]] || fail "请使用 root 运行，例如：curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/main/install.sh | sudo bash"
[[ "${MANAGER_PATH}" == /* ]] || fail "IMYEMAIL_MANAGER_PATH 必须是绝对路径。"
[[ "$(basename "${MANAGER_PATH}")" == "imyemail" ]] || fail "管理器路径必须以 imyemail 结尾。"
[[ "${VERSION}" =~ ^[A-Za-z0-9._-]+$ ]] || fail "IMYEMAIL_VERSION 格式无效。"

manager_dir="$(dirname "${MANAGER_PATH}")"
install -d -m 0755 "${manager_dir}"
canonical_manager_dir="$(cd -P "${manager_dir}" && pwd)"
[[ "${canonical_manager_dir}" == "${manager_dir}" ]] || fail "管理器目标目录不能是符号链接。"
[[ ! -L "${MANAGER_PATH}" && ! -d "${MANAGER_PATH}" ]] || fail "管理器目标不能是符号链接或目录。"
manager_new="$(mktemp "${manager_dir}/.imyemail.XXXXXXXX")"
cleanup_paths=()
cleanup() {
  local path
  for path in "${cleanup_paths[@]}"; do
    [[ -n "${path}" && "${path}" == /tmp/imyemail.* ]] && rm -rf -- "${path}"
  done
  [[ -f "${manager_new}" ]] && rm -f -- "${manager_new}"
}
trap cleanup EXIT

if [[ -n "${LOCAL_MANAGER}" ]]; then
  [[ -f "${LOCAL_MANAGER}" && -x "${LOCAL_MANAGER}" ]] || fail "IMYEMAIL_MANAGER_BINARY 不是可执行文件。"
  log "正在安装本地 Rust 管理器..."
  install -m 0755 "${LOCAL_MANAGER}" "${manager_new}"
else
  command -v curl >/dev/null 2>&1 || fail "系统缺少 curl，请先安装 curl。"
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) asset="imyemail-linux-amd64" ;;
    Linux-aarch64|Linux-arm64) asset="imyemail-linux-arm64" ;;
    *) fail "仅支持 Linux amd64/arm64。" ;;
  esac

  if [[ "${VERSION}" == "latest" ]]; then
    release_base="https://github.com/${REPOSITORY}/releases/latest/download"
  else
    release_base="https://github.com/${REPOSITORY}/releases/download/${VERSION}"
  fi
  temp_dir="$(mktemp -d /tmp/imyemail.XXXXXXXX)"
  cleanup_paths+=("${temp_dir}")
  log "正在下载 Rust 管理器 ${VERSION}..."
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --max-filesize 67108864 \
    "${release_base}/${asset}" -o "${temp_dir}/${asset}"
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
    --retry 3 --retry-all-errors --max-filesize 8192 \
    "${release_base}/${asset}.sha256" -o "${temp_dir}/${asset}.sha256"

  read -r expected_hash checksum_name extra < "${temp_dir}/${asset}.sha256" || fail "SHA-256 文件为空。"
  checksum_name="${checksum_name#\*}"
  [[ "${expected_hash}" =~ ^[0-9A-Fa-f]{64}$ ]] || fail "SHA-256 文件格式无效。"
  [[ "${checksum_name}" == "${asset}" ]] || fail "SHA-256 附件名缺失或不匹配。"
  [[ -z "${extra:-}" ]] || fail "SHA-256 文件格式无效。"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_hash="$(sha256sum "${temp_dir}/${asset}" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_hash="$(shasum -a 256 "${temp_dir}/${asset}" | awk '{print $1}')"
  else
    fail "系统缺少 sha256sum 或 shasum，无法验证管理器。"
  fi
  [[ "${actual_hash,,}" == "${expected_hash,,}" ]] || fail "管理器 SHA-256 校验失败。"
  install -m 0755 "${temp_dir}/${asset}" "${manager_new}"
fi

mv -f -- "${manager_new}" "${MANAGER_PATH}"
log "Rust 管理器已安装到 ${MANAGER_PATH}。"
cleanup
trap - EXIT
exec "${MANAGER_PATH}" "$@"
