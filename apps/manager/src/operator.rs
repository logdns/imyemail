use std::{
    env, fs,
    io::ErrorKind,
    path::Path,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use anyhow::{Context, Result, bail};
use chrono::{DateTime, Utc};
use reqwest::{blocking::Client, redirect::Policy};
use serde::Serialize;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use url::Url;

use crate::{
    acquire_operation_lock, assets, backup_database, command_output, do_rollback, ensure_docker,
    remember_current_image, require_installed, validate_image_reference,
};

const TOKEN_ENV: &str = "IMYEMAIL_UPDATE_TOKEN";
const PREPARE_DELAY: Duration = Duration::from_millis(1500);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationState {
    action: String,
    phase: String,
    message: String,
    requested_at: Option<String>,
    finished_at: Option<String>,
    error: Option<String>,
}

impl Default for OperationState {
    fn default() -> Self {
        Self {
            action: String::new(),
            phase: "idle".to_owned(),
            message: "当前没有进行中的系统操作".to_owned(),
            requested_at: None,
            finished_at: None,
            error: None,
        }
    }
}

impl OperationState {
    fn busy(&self) -> bool {
        matches!(self.phase.as_str(), "preparing" | "running")
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RollbackInfo {
    available: bool,
    image: Option<String>,
    version: Option<String>,
    created_at: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    ok: bool,
    rollback: RollbackInfo,
    operation: OperationState,
}

pub fn serve(install_dir: &Path, bind: &str, update_url: &str) -> Result<()> {
    assets::validate_install_dir(install_dir)?;
    let token = env::var(TOKEN_ENV).context("IMYEMAIL_UPDATE_TOKEN 未配置")?;
    if token.trim().len() < 32 {
        bail!("IMYEMAIL_UPDATE_TOKEN 长度不能少于 32 个字符");
    }
    validate_update_url(update_url)?;
    let server = Server::http(bind).map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let state = Arc::new(Mutex::new(OperationState::default()));
    println!("[imyemail] 内部运维服务正在监听 {bind}");

    for request in server.incoming_requests() {
        handle_request(
            request,
            install_dir,
            update_url,
            token.trim(),
            Arc::clone(&state),
        );
    }
    Ok(())
}

fn handle_request(
    request: Request,
    install_dir: &Path,
    update_url: &str,
    token: &str,
    state: Arc<Mutex<OperationState>>,
) {
    if !authorized(&request, token) {
        respond_json(
            request,
            StatusCode(401),
            &serde_json::json!({"error": "unauthorized"}),
        );
        return;
    }

    match (request.method(), request.url()) {
        (&Method::Get, "/v1/status") => {
            let operation = state.lock().map_or_else(
                |_| OperationState {
                    phase: "failed".to_owned(),
                    error: Some("运维状态锁不可用".to_owned()),
                    ..OperationState::default()
                },
                |value| value.clone(),
            );
            let rollback = rollback_info(install_dir);
            respond_json(
                request,
                StatusCode(200),
                &StatusPayload {
                    ok: true,
                    rollback,
                    operation,
                },
            );
        }
        (&Method::Post, "/v1/update") => {
            start_operation(request, install_dir, update_url, state, "update");
        }
        (&Method::Post, "/v1/rollback") => {
            start_operation(request, install_dir, update_url, state, "rollback");
        }
        (&Method::Delete, "/v1/rollback") => {
            delete_rollback_point(request, install_dir, &state);
        }
        _ => respond_json(
            request,
            StatusCode(404),
            &serde_json::json!({"error": "not found"}),
        ),
    }
}

fn delete_rollback_point(request: Request, install_dir: &Path, state: &Mutex<OperationState>) {
    let Ok(current) = state.lock() else {
        respond_json(
            request,
            StatusCode(500),
            &serde_json::json!({"error": "operation state unavailable"}),
        );
        return;
    };
    if current.busy() {
        respond_json(
            request,
            StatusCode(409),
            &serde_json::json!({"error": "another operation is already running"}),
        );
        return;
    }
    drop(current);

    let result = (|| {
        let _operation_lock = acquire_operation_lock()?;
        require_installed(install_dir)?;
        ensure_docker(false)?;
        delete_rollback_with(install_dir, |image| {
            command_output("docker", ["image", "rm", image]).map(|_| ())
        })
    })();
    match result {
        Ok(image) => respond_json(
            request,
            StatusCode(200),
            &serde_json::json!({"ok": true, "image": image, "message": "回滚版本已删除"}),
        ),
        Err(error) => respond_json(
            request,
            StatusCode(409),
            &serde_json::json!({"error": format!("{error:#}")}),
        ),
    }
}

fn delete_rollback_with<F>(install_dir: &Path, remove_image: F) -> Result<String>
where
    F: FnOnce(&str) -> Result<()>,
{
    let image_path = install_dir.join(".rollback-image");
    ensure_removable_regular_file(&image_path, true)?;
    let compose_path = install_dir.join(".rollback-compose.yml");
    let has_compose = ensure_removable_regular_file(&compose_path, false)?;
    let staged_image_path = install_dir.join(".rollback-image.deleting");
    let staged_compose_path = install_dir.join(".rollback-compose.yml.deleting");
    ensure_delete_staging_path_available(&staged_image_path)?;
    ensure_delete_staging_path_available(&staged_compose_path)?;
    let image = fs::read_to_string(&image_path)?.trim().to_owned();
    validate_image_reference(&image)?;

    fs::rename(&image_path, &staged_image_path).context("隔离回滚点元数据失败")?;
    if has_compose {
        if let Err(error) = fs::rename(&compose_path, &staged_compose_path) {
            fs::rename(&staged_image_path, &image_path)
                .context("隔离 Compose 失败后恢复回滚点元数据失败")?;
            return Err(error).context("隔离回滚 Compose 文件失败");
        }
    }

    if let Err(remove_error) = remove_image(&image) {
        let restore_result = restore_staged_rollback(
            &image_path,
            &staged_image_path,
            has_compose.then_some((&compose_path, &staged_compose_path)),
        );
        return match restore_result {
            Ok(()) => Err(remove_error).context("删除回滚镜像失败，回滚点已恢复"),
            Err(restore_error) => bail!(
                "删除回滚镜像失败且无法恢复回滚点元数据：{remove_error:#}；恢复错误：{restore_error:#}"
            ),
        };
    }

    if has_compose {
        fs::remove_file(&staged_compose_path).context("清理回滚 Compose 文件失败")?;
    }
    fs::remove_file(&staged_image_path).context("清理回滚点元数据失败")?;
    Ok(image)
}

fn ensure_delete_staging_path_available(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Ok(_) => bail!(
            "检测到未完成的回滚点删除文件，请先人工核验：{}",
            path.display()
        ),
        Err(error) => {
            Err(error).with_context(|| format!("读取回滚删除暂存文件失败：{}", path.display()))
        }
    }
}

fn restore_staged_rollback(
    image_path: &Path,
    staged_image_path: &Path,
    compose_paths: Option<(&Path, &Path)>,
) -> Result<()> {
    let compose_error = compose_paths.and_then(|(compose_path, staged_compose_path)| {
        fs::rename(staged_compose_path, compose_path).err()
    });
    let image_error = fs::rename(staged_image_path, image_path).err();
    match (image_error, compose_error) {
        (None, None) => Ok(()),
        (Some(image_error), None) => Err(image_error).context("恢复回滚点元数据失败"),
        (None, Some(compose_error)) => Err(compose_error).context("恢复回滚 Compose 文件失败"),
        (Some(image_error), Some(compose_error)) => {
            bail!("恢复回滚点元数据失败：{image_error}；恢复回滚 Compose 文件失败：{compose_error}")
        }
    }
}

fn ensure_removable_regular_file(path: &Path, required: bool) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => bail!("拒绝删除非普通回滚文件：{}", path.display()),
        Err(error) if error.kind() == ErrorKind::NotFound && !required => Ok(false),
        Err(error) if error.kind() == ErrorKind::NotFound => bail!("尚未创建可用的版本回滚点"),
        Err(error) => Err(error).with_context(|| format!("读取回滚文件失败：{}", path.display())),
    }
}

fn start_operation(
    request: Request,
    install_dir: &Path,
    update_url: &str,
    state: Arc<Mutex<OperationState>>,
    action: &'static str,
) {
    let requested_at = Utc::now().to_rfc3339();
    let Ok(mut current) = state.lock() else {
        respond_json(
            request,
            StatusCode(500),
            &serde_json::json!({"error": "operation state unavailable"}),
        );
        return;
    };
    if current.busy() {
        respond_json(
            request,
            StatusCode(409),
            &serde_json::json!({"error": "another operation is already running"}),
        );
        return;
    }
    *current = OperationState {
        action: action.to_owned(),
        phase: "preparing".to_owned(),
        message: if action == "update" {
            "正在创建更新前备份和回滚点"
        } else {
            "正在创建回滚前数据库备份"
        }
        .to_owned(),
        requested_at: Some(requested_at.clone()),
        finished_at: None,
        error: None,
    };
    drop(current);

    respond_json(
        request,
        StatusCode(202),
        &serde_json::json!({
            "ok": true,
            "action": action,
            "phase": "preparing",
            "requestedAt": requested_at,
        }),
    );

    let install_dir = install_dir.to_path_buf();
    let update_url = update_url.to_owned();
    thread::spawn(move || {
        thread::sleep(PREPARE_DELAY);
        set_running(&state, action);
        let result = run_operation(&install_dir, &update_url, action);
        finish_operation(&state, action, result);
    });
}

fn run_operation(install_dir: &Path, update_url: &str, action: &str) -> Result<()> {
    let _operation_lock = acquire_operation_lock()?;
    require_installed(install_dir)?;
    ensure_docker(false)?;
    backup_database(install_dir)?;

    if action == "rollback" {
        return do_rollback(install_dir);
    }

    let available = remember_current_image(install_dir)?;
    if !available {
        bail!("当前服务未运行，无法创建镜像回滚点");
    }
    assets::remember_compose(install_dir)?;
    trigger_watchtower(update_url)
}

fn trigger_watchtower(endpoint: &str) -> Result<()> {
    let token = env::var(TOKEN_ENV).context("IMYEMAIL_UPDATE_TOKEN 未配置")?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(120))
        .redirect(Policy::none())
        .build()?;
    let response = client
        .post(endpoint)
        .bearer_auth(token.trim())
        .send()
        .context("无法连接内部 Watchtower 更新服务")?;
    if !response.status().is_success() {
        bail!("Watchtower 返回 {}", response.status());
    }
    Ok(())
}

fn set_running(state: &Mutex<OperationState>, action: &str) {
    if let Ok(mut current) = state.lock() {
        "running".clone_into(&mut current.phase);
        if action == "update" {
            "更新已触发，正在重启应用服务"
        } else {
            "正在切换到上一版本镜像"
        }
        .clone_into(&mut current.message);
    }
}

fn finish_operation(state: &Mutex<OperationState>, action: &str, result: Result<()>) {
    if let Ok(mut current) = state.lock() {
        current.finished_at = Some(Utc::now().to_rfc3339());
        match result {
            Ok(()) => {
                "completed".clone_into(&mut current.phase);
                if action == "update" {
                    "更新服务已完成镜像切换"
                } else {
                    "已回滚到上一版本镜像"
                }
                .clone_into(&mut current.message);
                current.error = None;
            }
            Err(error) => {
                "failed".clone_into(&mut current.phase);
                "系统操作失败".clone_into(&mut current.message);
                current.error = Some(format!("{error:#}"));
            }
        }
    }
}

fn rollback_info(install_dir: &Path) -> RollbackInfo {
    match inspect_rollback(install_dir) {
        Ok((image, version, created_at)) => RollbackInfo {
            available: true,
            image: Some(image),
            version,
            created_at,
            reason: None,
        },
        Err(error) => RollbackInfo {
            available: false,
            image: None,
            version: None,
            created_at: None,
            reason: Some(error.to_string()),
        },
    }
}

fn inspect_rollback(install_dir: &Path) -> Result<(String, Option<String>, Option<String>)> {
    let path = install_dir.join(".rollback-image");
    if !fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_file()) {
        bail!("尚未创建可用的版本回滚点");
    }
    let image = fs::read_to_string(&path)?.trim().to_owned();
    validate_image_reference(&image)?;
    command_output(
        "docker",
        ["image", "inspect", "--format", "{{.Id}}", image.as_str()],
    )
    .context("回滚镜像已不存在")?;
    let version = command_output(
        "docker",
        [
            "image",
            "inspect",
            "--format",
            "{{ index .Config.Labels \"org.opencontainers.image.version\" }}",
            image.as_str(),
        ],
    )?;
    let version = match version.trim() {
        "" | "<no value>" => None,
        value => Some(value.to_owned()),
    };
    let created_at = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .map(|value| DateTime::<Utc>::from(value).to_rfc3339());
    Ok((image, version, created_at))
}

fn authorized(request: &Request, expected: &str) -> bool {
    let supplied = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .map(|header| header.value.as_str())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();
    constant_time_eq(supplied.as_bytes(), expected.as_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    let length = left.len().max(right.len());
    for index in 0..length {
        difference |= usize::from(*left.get(index).unwrap_or(&0) ^ *right.get(index).unwrap_or(&0));
    }
    difference == 0
}

fn validate_update_url(value: &str) -> Result<()> {
    let url = Url::parse(value).context("Watchtower URL 无效")?;
    if url.scheme() != "http"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!("Watchtower URL 必须是无凭据、查询和片段的内部 HTTP 地址");
    }
    Ok(())
}

fn respond_json<T: Serialize>(request: Request, status: StatusCode, payload: &T) {
    let body = serde_json::to_vec(payload)
        .unwrap_or_else(|_| b"{\"error\":\"serialization failed\"}".to_vec());
    let mut response = Response::from_data(body).with_status_code(status);
    if let Ok(header) = Header::from_bytes("Content-Type", "application/json; charset=utf-8") {
        response.add_header(header);
    }
    let _ = request.respond(response);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn compares_tokens_without_accepting_prefixes() {
        assert!(constant_time_eq(b"same-token", b"same-token"));
        assert!(!constant_time_eq(b"same", b"same-token"));
        assert!(!constant_time_eq(b"other-token", b"same-token"));
    }

    #[test]
    fn only_accepts_internal_http_update_urls() {
        assert!(validate_update_url("http://updater:8080/v1/update").is_ok());
        assert!(validate_update_url("https://updater/v1/update").is_err());
        assert!(validate_update_url("http://user:pass@updater/v1/update").is_err());
        assert!(validate_update_url("http://updater/v1/update?token=secret").is_err());
    }

    #[test]
    fn deletes_rollback_image_reference_and_compose_snapshot() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join(".rollback-image"),
            "imyemail:rollback-20260824\n",
        )
        .unwrap();
        fs::write(
            directory.path().join(".rollback-compose.yml"),
            "services: {}\n",
        )
        .unwrap();
        let removed = Cell::new(false);
        let image = delete_rollback_with(directory.path(), |image| {
            assert_eq!(image, "imyemail:rollback-20260824");
            removed.set(true);
            Ok(())
        })
        .unwrap();
        assert_eq!(image, "imyemail:rollback-20260824");
        assert!(removed.get());
        assert!(!directory.path().join(".rollback-image").exists());
        assert!(!directory.path().join(".rollback-compose.yml").exists());
    }

    #[test]
    fn refuses_symlinked_rollback_metadata_before_image_removal() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("target");
        fs::write(&target, "imyemail:rollback-20260824\n").unwrap();
        symlink(&target, directory.path().join(".rollback-image")).unwrap();
        let called = Cell::new(false);
        let result = delete_rollback_with(directory.path(), |_| {
            called.set(true);
            Ok(())
        });
        assert!(result.is_err());
        assert!(!called.get());
        assert!(target.exists());
    }

    #[test]
    fn refuses_symlinked_compose_snapshot_before_image_removal() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join(".rollback-image"),
            "imyemail:rollback-20260824\n",
        )
        .unwrap();
        let target = directory.path().join("compose-target");
        fs::write(&target, "services: {}\n").unwrap();
        symlink(&target, directory.path().join(".rollback-compose.yml")).unwrap();
        let called = Cell::new(false);
        let result = delete_rollback_with(directory.path(), |_| {
            called.set(true);
            Ok(())
        });
        assert!(result.is_err());
        assert!(!called.get());
        assert!(directory.path().join(".rollback-image").exists());
        assert!(target.exists());
    }

    #[test]
    fn preserves_rollback_files_when_image_removal_fails() {
        let directory = tempfile::tempdir().unwrap();
        let image_path = directory.path().join(".rollback-image");
        let compose_path = directory.path().join(".rollback-compose.yml");
        fs::write(&image_path, "imyemail:rollback-20260824\n").unwrap();
        fs::write(&compose_path, "services: {}\n").unwrap();

        let result = delete_rollback_with(directory.path(), |_| bail!("image is in use"));

        assert!(result.is_err());
        assert!(image_path.exists());
        assert!(compose_path.exists());
        assert!(!directory.path().join(".rollback-image.deleting").exists());
        assert!(
            !directory
                .path()
                .join(".rollback-compose.yml.deleting")
                .exists()
        );
    }

    #[test]
    fn refuses_preexisting_delete_staging_files_before_image_removal() {
        let directory = tempfile::tempdir().unwrap();
        let image_path = directory.path().join(".rollback-image");
        fs::write(&image_path, "imyemail:rollback-20260824\n").unwrap();
        fs::write(
            directory.path().join(".rollback-image.deleting"),
            "unexpected\n",
        )
        .unwrap();
        let called = Cell::new(false);

        let result = delete_rollback_with(directory.path(), |_| {
            called.set(true);
            Ok(())
        });

        assert!(result.is_err());
        assert!(!called.get());
        assert!(image_path.exists());
    }
}
