use std::{
    fs,
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Component, Path, PathBuf},
    process,
    sync::atomic::{AtomicU64, Ordering},
};

use anyhow::{Context, Result, bail};

pub const COMPOSE: &str = include_str!("../../../deploy/docker-compose.yml");
pub const ENV_EXAMPLE: &str = include_str!("../../../deploy/.env.example");
pub const MANAGED_MARKER: &str = ".imyemail-managed";
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn validate_install_dir(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        bail!("安装目录必须是绝对路径");
    }
    if path
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        bail!("安装目录不能包含 ..");
    }
    let normalized: PathBuf = path.components().collect();
    let text = normalized.to_string_lossy();
    if !text
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '_' | '-'))
    {
        bail!("安装目录只能包含字母、数字、/、.、_ 和 -");
    }
    if matches!(
        text.as_ref(),
        "/" | "/opt" | "/usr" | "/var" | "/home" | "/root" | "/etc"
    ) {
        bail!("拒绝使用过于宽泛的安装目录：{text}");
    }
    if path.exists() && fs::symlink_metadata(path)?.file_type().is_symlink() {
        bail!("安装目录不能是符号链接");
    }
    let mut existing_ancestor = normalized.as_path();
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .context("安装目录没有可验证的父目录")?;
    }
    if fs::symlink_metadata(existing_ancestor)?
        .file_type()
        .is_symlink()
    {
        bail!("安装目录的父路径不能包含符号链接或别名");
    }
    let canonical = fs::canonicalize(existing_ancestor)?;
    if canonical != existing_ancestor {
        bail!("安装目录的父路径不能包含符号链接或别名");
    }
    if path.exists() && !fs::symlink_metadata(path)?.is_dir() {
        bail!("安装目录必须是普通目录");
    }
    Ok(())
}

pub fn prepare_directories(install_dir: &Path) -> Result<()> {
    validate_install_dir(install_dir)?;
    create_dir(install_dir, 0o755)?;
    for name in ["data", "mail", "dkim"] {
        create_dir(&install_dir.join(name), 0o755)?;
    }
    create_dir(&install_dir.join("data/backups"), 0o700)?;
    atomic_write(
        &install_dir.join(MANAGED_MARKER),
        b"managed-by=imyemail\n",
        0o600,
    )
}

pub fn refresh_embedded_assets(install_dir: &Path) -> Result<()> {
    prepare_directories(install_dir)?;
    atomic_write(
        &install_dir.join("docker-compose.yml"),
        COMPOSE.as_bytes(),
        0o644,
    )?;
    atomic_write(
        &install_dir.join(".env.example"),
        ENV_EXAMPLE.as_bytes(),
        0o644,
    )
}

pub fn remember_compose(install_dir: &Path) -> Result<()> {
    let source = install_dir.join("docker-compose.yml");
    if source.is_file() {
        let contents = fs::read(&source).context("读取当前 Compose 文件失败")?;
        atomic_write(&install_dir.join(".rollback-compose.yml"), &contents, 0o600)?;
    }
    Ok(())
}

pub fn restore_compose(install_dir: &Path) -> Result<()> {
    let rollback = install_dir.join(".rollback-compose.yml");
    if rollback.is_file() {
        let contents = fs::read(&rollback).context("读取回滚 Compose 文件失败")?;
        atomic_write(&install_dir.join("docker-compose.yml"), &contents, 0o644)?;
    }
    Ok(())
}

pub fn atomic_write(path: &Path, contents: &[u8], mode: u32) -> Result<()> {
    if path.exists() && fs::symlink_metadata(path)?.file_type().is_symlink() {
        bail!("拒绝覆盖符号链接：{}", path.display());
    }
    let parent = path.parent().context("目标文件没有父目录")?;
    fs::create_dir_all(parent)?;
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let filename = path
        .file_name()
        .context("目标文件名无效")?
        .to_string_lossy();
    let temporary = parent.join(format!(".{filename}.tmp-{}-{counter}", process::id()));
    let result = (|| -> Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(mode)
            .open(&temporary)
            .with_context(|| format!("创建临时文件失败：{}", temporary.display()))?;
        file.write_all(contents)?;
        file.sync_all()?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(mode))?;
        fs::rename(&temporary, path)?;
        sync_directory(parent)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn create_dir(path: &Path, mode: u32) -> Result<()> {
    if path.exists() && fs::symlink_metadata(path)?.file_type().is_symlink() {
        bail!("目录不能是符号链接：{}", path.display());
    }
    fs::create_dir_all(path)?;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    Ok(())
}

fn sync_directory(path: &Path) -> Result<()> {
    fs::File::open(path)?.sync_all()?;
    Ok(())
}

pub fn env_file(install_dir: &Path) -> PathBuf {
    install_dir.join(".env")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_dangerous_install_paths() {
        for path in [
            "/",
            "/opt",
            "/opt/.",
            "/opt//",
            "/var",
            "relative/path",
            "/tmp/has space",
        ] {
            assert!(validate_install_dir(Path::new(path)).is_err(), "{path}");
        }
        assert!(validate_install_dir(Path::new("/opt/imyemail-test")).is_ok());
    }

    #[test]
    fn atomically_replaces_regular_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("asset");
        atomic_write(&path, b"first", 0o600).unwrap();
        atomic_write(&path, b"second", 0o600).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_replace_symlink() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("target");
        let link = directory.path().join("link");
        fs::write(&target, b"safe").unwrap();
        symlink(&target, &link).unwrap();
        assert!(atomic_write(&link, b"unsafe", 0o600).is_err());
        assert_eq!(fs::read(target).unwrap(), b"safe");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_nonexistent_install_directory_below_symlink() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let real_parent = directory.path().join("real");
        let linked_parent = directory.path().join("linked");
        fs::create_dir(&real_parent).unwrap();
        symlink(&real_parent, &linked_parent).unwrap();
        assert!(validate_install_dir(&linked_parent.join("imyemail")).is_err());
    }
}
