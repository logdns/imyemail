use std::{
    env,
    fmt::Write as _,
    fs,
    io::Read,
    os::unix::fs::PermissionsExt,
    path::{Component, Path, PathBuf},
    time::Duration,
};

use anyhow::{Context, Result, bail};
use reqwest::{StatusCode, blocking::Client, redirect::Policy};
use sha2::{Digest, Sha256};

use crate::assets::atomic_write;

const MAX_BINARY_BYTES: u64 = 64 * 1024 * 1024;
const RELEASE_BASE: &str = "https://github.com/logdns/imyemail/releases/latest/download";

pub fn installed_path() -> PathBuf {
    env::var_os("IMYEMAIL_MANAGER_PATH")
        .map_or_else(|| PathBuf::from("/usr/local/bin/imyemail"), PathBuf::from)
}

pub fn running_installed_binary() -> bool {
    let Ok(current) = env::current_exe().and_then(fs::canonicalize) else {
        return false;
    };
    let destination = installed_path();
    if validate_installed_path(&destination).is_err() {
        return false;
    }
    destination
        .canonicalize()
        .is_ok_and(|installed| installed == current)
}

pub fn update() -> Result<bool> {
    if env::consts::OS != "linux" {
        bail!("管理器自动更新仅支持 Linux");
    }
    let architecture = match env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => bail!("不支持的 CPU 架构：{other}"),
    };
    let base = env::var("IMYEMAIL_MANAGER_RELEASE_BASE").unwrap_or_else(|_| RELEASE_BASE.into());
    let allow_insecure = env::var("IMYEMAIL_ALLOW_INSECURE_DOWNLOADS").as_deref() == Ok("1");
    if !base.starts_with("https://") && !allow_insecure {
        bail!("管理器下载地址必须使用 HTTPS");
    }
    let asset = format!("imyemail-linux-{architecture}");
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .redirect(Policy::custom(move |attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("管理器下载重定向次数过多");
            }
            if attempt.url().scheme() == "https" || allow_insecure {
                attempt.follow()
            } else {
                attempt.error("管理器下载拒绝重定向到非 HTTPS 地址")
            }
        }))
        .build()?;
    let checksum = download(&client, &format!("{base}/{asset}.sha256"), 8192)?;
    let expected = parse_checksum(&String::from_utf8(checksum)?, &asset)?;
    let binary = download(&client, &format!("{base}/{asset}"), MAX_BINARY_BYTES)?;
    let actual = hex_digest(&binary);
    if actual != expected {
        bail!("管理器 SHA-256 校验失败");
    }

    let destination = installed_path();
    validate_installed_path(&destination)?;
    if destination.is_file() && digest_file(&destination)? == expected {
        return Ok(false);
    }
    atomic_write(&destination, &binary, 0o755)?;
    fs::set_permissions(&destination, fs::Permissions::from_mode(0o755))?;
    Ok(true)
}

pub fn validate_installed_path(path: &Path) -> Result<()> {
    if !path.is_absolute()
        || path.file_name().and_then(|name| name.to_str()) != Some("imyemail")
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        bail!("管理器路径必须是以 imyemail 结尾的绝对路径且不能包含 ..");
    }
    let parent = path.parent().context("管理器目标路径没有父目录")?;
    let canonical_parent = parent
        .canonicalize()
        .with_context(|| format!("管理器目标目录不存在：{}", parent.display()))?;
    if canonical_parent != parent {
        bail!("管理器目标目录不能是符号链接：{}", parent.display());
    }
    if path.exists() && fs::symlink_metadata(path)?.file_type().is_symlink() {
        bail!("管理器目标不能是符号链接：{}", path.display());
    }
    Ok(())
}

fn download(client: &Client, url: &str, limit: u64) -> Result<Vec<u8>> {
    let mut response = client.get(url).send().context("下载管理器发行附件失败")?;
    if response.status() != StatusCode::OK {
        bail!("下载管理器发行附件失败：HTTP {}", response.status());
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        bail!("管理器发行附件超过大小限制");
    }
    let mut bytes = Vec::new();
    response.by_ref().take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        bail!("管理器发行附件超过大小限制");
    }
    Ok(bytes)
}

fn digest_file(path: &Path) -> Result<String> {
    let contents = fs::read(path)?;
    Ok(hex_digest(&contents))
}

fn hex_digest(contents: &[u8]) -> String {
    let digest = Sha256::digest(contents);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}

fn parse_checksum(contents: &str, expected_asset: &str) -> Result<String> {
    let mut fields = contents.split_whitespace();
    let hash = fields.next().context("SHA-256 文件为空")?;
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("SHA-256 文件格式无效");
    }
    let filename = fields.next().context("SHA-256 文件缺少附件名")?;
    if filename.trim_start_matches('*') != expected_asset {
        bail!("SHA-256 文件中的附件名不匹配");
    }
    if fields.next().is_some() {
        bail!("SHA-256 文件格式无效");
    }
    Ok(hash.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_checksum_file_and_filename() {
        let hash = "a".repeat(64);
        assert_eq!(
            parse_checksum(&format!("{hash}  asset"), "asset").unwrap(),
            hash
        );
        assert!(parse_checksum(&format!("{hash}  other"), "asset").is_err());
        assert!(parse_checksum(&hash, "asset").is_err());
        assert!(parse_checksum("not-a-hash asset", "asset").is_err());
        assert!(parse_checksum(&format!("{hash} asset extra"), "asset").is_err());
    }

    #[test]
    fn validates_manager_destination() {
        let directory = tempfile::tempdir().unwrap();
        let valid = directory.path().canonicalize().unwrap().join("imyemail");
        assert!(validate_installed_path(&valid).is_ok());
        assert!(validate_installed_path(&directory.path().join("other")).is_err());
        assert!(validate_installed_path(Path::new("relative/imyemail")).is_err());
    }
}
