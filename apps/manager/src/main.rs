mod assets;
mod envfile;
mod operator;
mod self_update;

use std::{
    env,
    fmt::Write as _,
    fs,
    io::{BufRead, BufReader, IsTerminal, Read, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Command, ExitCode, ExitStatus, Stdio},
    thread,
    time::Duration,
};

use anyhow::{Context, Result, bail};
use chrono::Utc;
use clap::{Parser, Subcommand};
use fs2::FileExt;
use reqwest::{blocking::Client, redirect::Policy};
use url::Url;

const SERVICE: &str = "imyemail";
const UPDATER_SERVICE: &str = "updater";

#[derive(Debug, Parser)]
#[command(name = "imyemail", version, about = "imyemail 安装与运维管理器")]
struct Cli {
    /// 安装及持久化数据目录。
    #[arg(
        long,
        global = true,
        env = "IMYEMAIL_INSTALL_DIR",
        default_value = "/opt/imyemail"
    )]
    install_dir: PathBuf,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// 首次安装或修复部署。
    Install,
    /// 备份数据库、更新管理器和服务，并在失败时自动回滚。
    Update {
        /// 不检查管理器发行附件，仅更新服务。
        #[arg(long)]
        skip_manager_update: bool,
    },
    /// 只更新当前管理二进制。
    SelfUpdate,
    /// 创建在线 `SQLite` 备份。
    Backup,
    /// 回滚到上次命令行更新前的镜像和 Compose 文件。
    Rollback,
    /// 启动仅供容器内 API 使用的在线更新与回滚服务。
    #[command(hide = true)]
    ServeOperator {
        #[arg(long, env = "IMYEMAIL_OPERATOR_BIND", default_value = "0.0.0.0:8080")]
        bind: String,
        #[arg(
            long,
            env = "IMYEMAIL_WATCHTOWER_UPDATE_URL",
            default_value = "http://updater:8080/v1/update"
        )]
        update_url: String,
    },
    /// 查看容器和健康状态。
    Status,
    /// 检查 Docker、配置权限、Compose 和健康状态。
    Doctor,
    /// 查看服务日志。
    Logs {
        #[arg(long, default_value_t = 200)]
        tail: u32,
        #[arg(long)]
        no_follow: bool,
    },
    /// 启动服务。
    Start,
    /// 停止服务但保留容器。
    Stop,
    /// 重启服务并检查健康状态。
    Restart,
    /// 移除容器和管理命令；默认保留配置及邮件。
    Uninstall {
        /// 永久删除安装目录内的配置、数据库、邮件、DKIM 私钥和备份。
        #[arg(long)]
        purge: bool,
        /// 跳过永久删除确认，适用于自动化。
        #[arg(long, requires = "purge")]
        yes: bool,
        /// 保留 /usr/local/bin/imyemail 管理命令。
        #[arg(long)]
        keep_command: bool,
    },
}

impl Commands {
    fn mutates_system(&self) -> bool {
        !matches!(
            self,
            Self::Status | Self::Doctor | Self::Logs { .. } | Self::ServeOperator { .. }
        )
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("\x1b[1;31m[错误]\x1b[0m {error:#}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    assets::validate_install_dir(&cli.install_dir)?;
    let command = cli.command.unwrap_or(Commands::Install);
    let _operation_lock =
        if command.mutates_system() && env::var_os("IMYEMAIL_MANAGER_REEXEC").is_none() {
            require_root()?;
            Some(acquire_operation_lock()?)
        } else {
            None
        };
    match command {
        Commands::Install => do_install(&cli.install_dir),
        Commands::Update {
            skip_manager_update,
        } => do_update(&cli.install_dir, skip_manager_update),
        Commands::SelfUpdate => {
            require_root()?;
            if self_update::update()? {
                success("管理器已更新。");
            } else {
                success("管理器已经是最新版本。");
            }
            Ok(())
        }
        Commands::Backup => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            backup_database(&cli.install_dir)?;
            Ok(())
        }
        Commands::Rollback => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            do_rollback(&cli.install_dir)
        }
        Commands::ServeOperator { bind, update_url } => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            operator::serve(&cli.install_dir, &bind, &update_url)
        }
        Commands::Status => {
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            do_status(&cli.install_dir)
        }
        Commands::Doctor => do_doctor(&cli.install_dir),
        Commands::Logs { tail, no_follow } => {
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            do_logs(&cli.install_dir, tail, no_follow)
        }
        Commands::Start => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            compose_checked(&cli.install_dir, ["up", "-d", "--remove-orphans"])?;
            wait_for_health(&cli.install_dir, 90)?;
            success("服务已启动。");
            Ok(())
        }
        Commands::Stop => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            compose_checked(&cli.install_dir, ["stop"])?;
            success("服务已停止，容器和数据均已保留。");
            Ok(())
        }
        Commands::Restart => {
            require_root()?;
            require_installed(&cli.install_dir)?;
            ensure_docker(false)?;
            compose_checked(&cli.install_dir, ["restart"])?;
            wait_for_health(&cli.install_dir, 90)?;
            success("服务已重启并通过健康检查。");
            Ok(())
        }
        Commands::Uninstall {
            purge,
            yes,
            keep_command,
        } => do_uninstall(&cli.install_dir, purge, yes, keep_command),
    }
}

fn do_install(install_dir: &Path) -> Result<()> {
    require_root()?;
    ensure_system_time_sync();
    ensure_docker(true)?;
    let repairing =
        install_dir.join("docker-compose.yml").is_file() && assets::env_file(install_dir).is_file();
    let rollback_available = if repairing {
        configure_first_install(install_dir)?;
        log("检测到现有部署，正在创建修复前备份和回滚点...");
        backup_database(install_dir)?;
        let available = remember_current_image(install_dir)?;
        assets::remember_compose(install_dir)?;
        available
    } else {
        false
    };
    assets::refresh_embedded_assets(install_dir)?;
    if !repairing {
        configure_first_install(install_dir)?;
    }
    ensure_update_token(install_dir)?;
    log("正在拉取 imyemail 镜像...");
    if !compose_status(install_dir, ["pull"], None)?.success() {
        if repairing {
            assets::restore_compose(install_dir)?;
        }
        bail!("镜像拉取失败，服务未切换");
    }
    log("正在启动服务...");
    if !compose_status(install_dir, ["up", "-d", "--remove-orphans"], None)?.success() {
        if repairing {
            return rollback_failed_update(install_dir, rollback_available, "修复后容器启动失败");
        }
        bail!("容器启动失败，请执行 imyemail logs 查看日志");
    }
    if wait_for_health(install_dir, 90).is_err() {
        if repairing {
            return rollback_failed_update(install_dir, rollback_available, "修复后健康检查失败");
        }
        bail!("服务未通过健康检查，请执行 imyemail logs 查看日志");
    }
    let public_url = envfile::value(&assets::env_file(install_dir), "IMYEMAIL_PUBLIC_BASE_URL")?
        .unwrap_or_default();
    success(&format!("安装完成：{public_url}"));
    warn("下一步请配置 MX、SPF、DKIM、DMARC，并确认邮件端口可访问。");
    Ok(())
}

fn do_update(install_dir: &Path, skip_manager_update: bool) -> Result<()> {
    require_root()?;
    require_installed(install_dir)?;
    if !skip_manager_update
        && env::var_os("IMYEMAIL_MANAGER_REEXEC").is_none()
        && self_update::running_installed_binary()
        && self_update::update()?
    {
        log("管理器已更新，正在使用新版本继续更新...");
        let installed_path = self_update::installed_path();
        self_update::validate_installed_path(&installed_path)?;
        let status = Command::new(installed_path)
            .args(env::args_os().skip(1))
            .env("IMYEMAIL_MANAGER_REEXEC", "1")
            .status()?;
        if !status.success() {
            bail!("更新后的管理器执行失败");
        }
        return Ok(());
    }

    ensure_system_time_sync();
    ensure_docker(false)?;
    ensure_update_token(install_dir)?;
    backup_database(install_dir)?;
    let rollback_available = remember_current_image(install_dir)?;
    assets::remember_compose(install_dir)?;
    assets::refresh_embedded_assets(install_dir)?;

    log("正在拉取最新版镜像...");
    if !compose_status(install_dir, ["pull"], None)?.success() {
        assets::restore_compose(install_dir)?;
        bail!("镜像拉取失败，服务未切换");
    }
    if !compose_status(install_dir, ["up", "-d", "--remove-orphans"], None)?.success() {
        return rollback_failed_update(install_dir, rollback_available, "新版本容器启动失败");
    }
    if wait_for_health(install_dir, 90).is_err() {
        return rollback_failed_update(install_dir, rollback_available, "新版本健康检查失败");
    }
    success("系统已更新，配置、邮件和数据库均已保留。");
    Ok(())
}

fn ensure_system_time_sync() {
    let mut synchronization_requested = false;
    if command_exists("timedatectl") {
        match command_status("timedatectl", ["set-ntp", "true"]) {
            Ok(status) if status.success() => {
                synchronization_requested = true;
                log("已确保系统网络时间同步开启（TOTP 依赖准确时间）");
            }
            Ok(_) | Err(_) => warn(
                "无法自动开启系统网络时间同步；请检查 timedatectl status，恢复码仍可用于登录。",
            ),
        }
    }
    if command_exists("chronyc") {
        match command_status("chronyc", ["-a", "makestep"]) {
            Ok(status) if status.success() => {
                synchronization_requested = true;
                log("已请求 chrony 立即校正系统时间");
            }
            Ok(_) | Err(_) => warn("chrony 未能立即校正系统时间，请检查 chronyc tracking。"),
        }
    }
    if !synchronization_requested {
        warn(
            "未能自动请求时间同步；请确保宿主机通过 NTP/chrony 保持时间准确，恢复码仍可用于登录。",
        );
    }
}

fn rollback_failed_update(
    install_dir: &Path,
    rollback_available: bool,
    reason: &str,
) -> Result<()> {
    if rollback_available {
        warn(&format!("{reason}，正在自动回滚。"));
        do_rollback(install_dir)?;
        bail!("更新失败，已回滚到原镜像");
    }
    assets::restore_compose(install_dir)?;
    bail!("{reason}；更新前服务未运行，没有可用的镜像回滚点，已恢复 Compose 文件")
}

fn do_rollback(install_dir: &Path) -> Result<()> {
    let rollback_path = install_dir.join(".rollback-image");
    let image = fs::read_to_string(&rollback_path)
        .context("没有可用的回滚镜像")?
        .trim()
        .to_owned();
    validate_image_reference(&image)?;
    if !command_status("docker", ["image", "inspect", &image])?.success() {
        bail!("回滚镜像已不存在：{image}");
    }
    assets::restore_compose(install_dir)?;
    log(&format!("正在回滚到 {image}..."));
    let status = compose_status(
        install_dir,
        ["up", "-d", "--no-deps", "--force-recreate", SERVICE],
        Some(("IMYEMAIL_IMAGE", image.as_str())),
    )?;
    if !status.success() {
        bail!("回滚容器启动失败");
    }
    wait_for_health(install_dir, 90)?;
    success(&format!("已回滚到 {image}。"));
    Ok(())
}

fn do_status(install_dir: &Path) -> Result<()> {
    compose_checked(install_dir, ["ps"])?;
    wait_for_health(install_dir, 1)?;
    success("Web 与 API 健康检查正常。");
    Ok(())
}

fn do_logs(install_dir: &Path, tail: u32, no_follow: bool) -> Result<()> {
    let tail_value = tail.to_string();
    let mut args = vec!["logs", "--tail", tail_value.as_str()];
    if !no_follow {
        args.push("-f");
    }
    args.extend([SERVICE, UPDATER_SERVICE]);
    compose_checked(install_dir, args)
}

fn do_doctor(install_dir: &Path) -> Result<()> {
    assets::validate_install_dir(install_dir)?;
    require_installed(install_dir)?;
    ensure_docker(false)?;
    let env_path = assets::env_file(install_dir);
    let mode = fs::metadata(&env_path)?.permissions().mode() & 0o777;
    if mode & 0o077 != 0 {
        bail!("{} 权限过宽，应为 0600", env_path.display());
    }
    let admin_password = envfile::value(&env_path, "IMYEMAIL_ADMIN_PASSWORD")?.unwrap_or_default();
    if admin_password == "ChangeMe123!" {
        bail!("仍在使用示例管理员密码 ChangeMe123!，请立即修改 IMYEMAIL_ADMIN_PASSWORD");
    }
    if admin_password.chars().count() < 10 {
        bail!("IMYEMAIL_ADMIN_PASSWORD 未设置或少于 10 个字符");
    }
    let update_token = envfile::value(&env_path, "IMYEMAIL_UPDATE_TOKEN")?.unwrap_or_default();
    if update_token.len() < 32 {
        bail!("IMYEMAIL_UPDATE_TOKEN 未设置或长度不足 32 个字符");
    }
    if envfile::value(&env_path, "IMYEMAIL_PUBLIC_BASE_URL")?
        .is_some_and(|value| value.starts_with("http://"))
    {
        warn(
            "IMYEMAIL_PUBLIC_BASE_URL 使用 HTTP；若 TLS 在反向代理终止，请确认代理与容器之间是可信网络。",
        );
    }
    if !compose_status(install_dir, ["config", "--quiet"], None)?.success() {
        bail!("Docker Compose 配置校验失败");
    }
    for directory in ["data", "mail", "dkim", "data/backups"] {
        let path = install_dir.join(directory);
        if !fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_dir()) {
            bail!("目录缺失或是符号链接：{}", path.display());
        }
    }
    wait_for_health(install_dir, 1)?;
    success("Docker、配置权限、目录、Compose 和健康检查均正常。");
    Ok(())
}

fn do_uninstall(install_dir: &Path, purge: bool, yes: bool, keep_command: bool) -> Result<()> {
    require_root()?;
    require_installed(install_dir)?;
    ensure_docker(false)?;
    if purge {
        require_managed_marker(install_dir)?;
        if !yes {
            confirm_purge(install_dir)?;
        }
    }
    compose_checked(install_dir, ["down", "--remove-orphans"])?;

    if purge {
        assets::validate_install_dir(install_dir)?;
        fs::remove_dir_all(install_dir)
            .with_context(|| format!("删除安装目录失败：{}", install_dir.display()))?;
        success("容器、配置、数据库、邮件、私钥和备份均已永久删除。");
    } else {
        success(&format!(
            "容器已移除，{} 中的配置、邮件和数据库仍然保留。",
            install_dir.display()
        ));
    }

    if !keep_command {
        remove_installed_command()?;
    }
    Ok(())
}

fn configure_first_install(install_dir: &Path) -> Result<()> {
    let env_path = assets::env_file(install_dir);
    if env_path.exists() {
        if !is_regular_file(&env_path) {
            bail!(
                "环境配置必须是普通文件且不能是符号链接：{}",
                env_path.display()
            );
        }
        let mode = fs::metadata(&env_path)?.permissions().mode() & 0o777;
        if mode & 0o077 != 0 {
            fs::set_permissions(&env_path, fs::Permissions::from_mode(0o600))?;
        }
        let database = install_dir.join("data/imyemail.db");
        let admin_password =
            envfile::value(&env_path, "IMYEMAIL_ADMIN_PASSWORD")?.unwrap_or_default();
        if !database.exists()
            && (admin_password.chars().count() < 10 || admin_password == "ChangeMe123!")
        {
            bail!(
                "现有 .env 未配置安全的初始管理员密码；请设置至少 10 个字符且非示例值的 IMYEMAIL_ADMIN_PASSWORD，或删除未完成的 .env 后重新安装"
            );
        }
        return Ok(());
    }

    let hostname = input_value(
        "IMYEMAIL_PUBLIC_HOSTNAME",
        "邮件服务器域名，例如 mail.example.com",
        None,
    )?;
    validate_hostname(&hostname)?;
    let public_url = input_value(
        "IMYEMAIL_PUBLIC_BASE_URL",
        "Webmail 访问地址",
        Some(&format!("https://{hostname}")),
    )?;
    validate_public_url(&public_url)?;
    let username = input_value("IMYEMAIL_ADMIN_USERNAME", "初始管理员用户名", Some("admin"))?;
    validate_username(&username)?;
    let (password, generated) = password_value()?;
    if password.chars().count() < 10 {
        bail!("管理员密码至少需要 10 个字符");
    }
    envfile::validate_value(&password)?;
    let update_token = random_secret()?;
    let contents = envfile::render(
        assets::ENV_EXAMPLE,
        &[
            ("IMYEMAIL_PUBLIC_HOSTNAME", hostname.as_str()),
            ("IMYEMAIL_PUBLIC_BASE_URL", public_url.as_str()),
            ("IMYEMAIL_ADMIN_USERNAME", username.as_str()),
            ("IMYEMAIL_ADMIN_PASSWORD", password.as_str()),
            ("IMYEMAIL_UPDATE_TOKEN", update_token.as_str()),
        ],
    )?;
    assets::atomic_write(&env_path, contents.as_bytes(), 0o600)?;

    if generated {
        let password_file = install_dir.join(".initial-admin-password");
        assets::atomic_write(&password_file, format!("{password}\n").as_bytes(), 0o600)?;
        warn(&format!(
            "管理员密码已生成并保存到 {}；首次登录后请删除该文件。",
            password_file.display()
        ));
    }
    Ok(())
}

fn ensure_update_token(install_dir: &Path) -> Result<()> {
    let env_path = assets::env_file(install_dir);
    if envfile::value(&env_path, "IMYEMAIL_UPDATE_TOKEN")?
        .is_none_or(|value| value.trim().is_empty())
    {
        envfile::set(&env_path, "IMYEMAIL_UPDATE_TOKEN", &random_secret()?)?;
    }
    let install_dir_value = install_dir
        .to_str()
        .context("安装目录必须是有效 UTF-8 路径")?;
    if envfile::value(&env_path, "IMYEMAIL_INSTALL_DIR")?
        .is_none_or(|value| value.trim() != install_dir_value)
    {
        envfile::set(&env_path, "IMYEMAIL_INSTALL_DIR", install_dir_value)?;
    }
    Ok(())
}

fn backup_database(install_dir: &Path) -> Result<Option<PathBuf>> {
    validate_storage_paths(install_dir)?;
    let database = install_dir.join("data/imyemail.db");
    if !database.exists() {
        log("数据库尚不存在，跳过备份。");
        return Ok(None);
    }
    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.9fZ");
    let filename = format!("cli-{timestamp}.db");
    let backup_directory = install_dir.join("data/backups");
    let host_backup = backup_directory.join(&filename);
    fs::create_dir_all(&backup_directory)?;
    fs::set_permissions(&backup_directory, fs::Permissions::from_mode(0o700))?;

    let container = compose_output(install_dir, ["ps", "-q", SERVICE])?;
    if !container.trim().is_empty() {
        let sqlite_command = format!(".backup '/data/backups/{filename}'");
        compose_checked(
            install_dir,
            [
                "exec",
                "-T",
                SERVICE,
                "sqlite3",
                "/data/imyemail.db",
                sqlite_command.as_str(),
            ],
        )?;
    } else if command_exists("sqlite3") {
        let sqlite_command = format!(".backup '{}'", host_backup.display());
        run_checked(
            Command::new(trusted_program("sqlite3")?)
                .arg(&database)
                .arg(sqlite_command),
            "离线数据库备份失败",
        )?;
    } else {
        bail!("服务未运行且宿主机缺少 sqlite3，无法创建更新前备份");
    }

    let metadata = fs::metadata(&host_backup).context("数据库备份文件未生成")?;
    if metadata.len() == 0 {
        bail!("数据库备份文件为空");
    }
    fs::set_permissions(&host_backup, fs::Permissions::from_mode(0o600))?;
    success(&format!("数据库已备份到 {}", host_backup.display()));
    Ok(Some(host_backup))
}

fn remember_current_image(install_dir: &Path) -> Result<bool> {
    let container = compose_output(install_dir, ["ps", "-q", SERVICE])?;
    let container = container.trim();
    if container.is_empty() {
        warn("当前服务未运行，本次更新无法保存镜像回滚点。");
        return Ok(false);
    }
    let output = command_output("docker", ["inspect", "--format", "{{.Image}}", container])?;
    let image_id = output.trim();
    validate_image_reference(image_id)?;
    let rollback_tag = format!("imyemail:rollback-{}", Utc::now().format("%Y%m%d%H%M%S"));
    run_checked(
        Command::new(trusted_program("docker")?)
            .arg("image")
            .arg("tag")
            .arg(image_id)
            .arg(&rollback_tag),
        "创建镜像回滚点失败",
    )?;
    assets::atomic_write(
        &install_dir.join(".rollback-image"),
        format!("{rollback_tag}\n").as_bytes(),
        0o600,
    )?;
    Ok(true)
}

fn wait_for_health(install_dir: &Path, attempts: u32) -> Result<()> {
    let bind = envfile::value(&assets::env_file(install_dir), "IMYEMAIL_HTTP_BIND")?
        .unwrap_or_else(|| "80".into());
    let port = health_port(&bind)?;
    let url = format!("http://127.0.0.1:{port}/healthz");
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .redirect(Policy::none())
        .build()?;
    for attempt in 0..attempts {
        if client
            .get(&url)
            .send()
            .is_ok_and(|response| response.status().is_success())
        {
            return Ok(());
        }
        if attempt + 1 < attempts {
            thread::sleep(Duration::from_secs(2));
        }
    }
    bail!("服务未通过健康检查，请执行 imyemail logs 查看日志")
}

fn health_port(bind: &str) -> Result<u16> {
    let bind = bind.trim();
    let port = if bind.bytes().all(|byte| byte.is_ascii_digit()) {
        bind
    } else {
        bind.rsplit_once(':')
            .map(|(_, port)| port)
            .context("IMYEMAIL_HTTP_BIND 格式无效")?
    };
    port.parse::<u16>().context("IMYEMAIL_HTTP_BIND 端口无效")
}

fn ensure_docker(install_missing: bool) -> Result<()> {
    if !command_exists("docker") {
        if !install_missing {
            bail!("未检测到 Docker，请先安装 Docker Engine");
        }
        install_docker_packages()?;
    }
    if install_missing && command_exists("systemctl") {
        let _ = command_status("systemctl", ["enable", "--now", "docker"]);
    }
    if !command_status("docker", ["info"])?.success() {
        bail!("Docker daemon 不可用");
    }
    if !command_status("docker", ["compose", "version"])?.success() {
        if install_missing {
            install_compose_package()?;
        }
        if !command_status("docker", ["compose", "version"])?.success() {
            bail!("需要 Docker Compose v2");
        }
    }
    Ok(())
}

fn install_docker_packages() -> Result<()> {
    if !command_exists("apt-get") {
        bail!("仅支持在 Debian/Ubuntu 自动安装 Docker；请手动安装 Docker Engine 和 Compose v2");
    }
    log("正在从系统软件源安装 Docker Engine...");
    run_checked(
        Command::new(trusted_program("apt-get")?).arg("update"),
        "更新系统软件源失败",
    )?;
    run_checked(
        Command::new(trusted_program("apt-get")?)
            .env("DEBIAN_FRONTEND", "noninteractive")
            .args(["install", "-y", "ca-certificates", "docker.io"]),
        "安装 Docker Engine 失败",
    )?;
    install_compose_package()
}

fn install_compose_package() -> Result<()> {
    for package in ["docker-compose-v2", "docker-compose-plugin"] {
        let status = Command::new(trusted_program("apt-get")?)
            .env("DEBIAN_FRONTEND", "noninteractive")
            .args(["install", "-y", package])
            .status()?;
        if status.success() {
            return Ok(());
        }
    }
    bail!("系统软件源未提供 Docker Compose v2，请按 Docker 官方文档安装")
}

fn compose_checked<I, S>(install_dir: &Path, args: I) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let status = compose_status(install_dir, args, None)?;
    if !status.success() {
        bail!("Docker Compose 命令执行失败");
    }
    Ok(())
}

fn compose_status<I, S>(
    install_dir: &Path,
    args: I,
    extra_env: Option<(&str, &str)>,
) -> Result<ExitStatus>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut command = compose_command(install_dir)?;
    command.args(args);
    if let Some((key, value)) = extra_env {
        command.env(key, value);
    }
    Ok(command.status()?)
}

fn compose_output<I, S>(install_dir: &Path, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut command = compose_command(install_dir)?;
    let output = command.args(args).output()?;
    if !output.status.success() {
        bail!("Docker Compose 命令执行失败");
    }
    Ok(String::from_utf8(output.stdout)?)
}

fn compose_command(install_dir: &Path) -> Result<Command> {
    let mut command = Command::new(trusted_program("docker")?);
    command
        .arg("compose")
        .arg("--project-directory")
        .arg(install_dir)
        .arg("-f")
        .arg(install_dir.join("docker-compose.yml"));
    Ok(command)
}

fn run_checked(command: &mut Command, message: &str) -> Result<()> {
    if !command.status()?.success() {
        bail!("{message}");
    }
    Ok(())
}

fn command_status<I, S>(program: &str, args: I) -> Result<ExitStatus>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    Ok(Command::new(trusted_program(program)?)
        .args(args)
        .stdin(Stdio::null())
        .status()?)
}

fn command_output<I, S>(program: &str, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let output = Command::new(trusted_program(program)?)
        .args(args)
        .output()?;
    if !output.status.success() {
        bail!("命令执行失败：{program}");
    }
    Ok(String::from_utf8(output.stdout)?)
}

fn command_exists(program: &str) -> bool {
    trusted_program(program).is_ok()
}

fn trusted_program(program: &str) -> Result<PathBuf> {
    if program.contains('/') || program.is_empty() {
        bail!("命令名无效：{program}");
    }
    for directory in [
        "/usr/local/sbin",
        "/usr/local/bin",
        "/usr/sbin",
        "/usr/bin",
        "/sbin",
        "/bin",
        "/snap/bin",
    ] {
        let candidate = Path::new(directory).join(program);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    bail!("未找到受信任的系统命令：{program}")
}

fn require_root() -> Result<()> {
    let status = fs::read_to_string("/proc/self/status").context("无法读取当前进程身份")?;
    let effective_uid = status
        .lines()
        .find_map(|line| line.strip_prefix("Uid:"))
        .and_then(|uids| uids.split_whitespace().nth(1))
        .context("无法确定当前进程的有效用户 ID")?;
    if effective_uid != "0" {
        bail!("请使用 root 运行，例如 sudo imyemail <command>");
    }
    Ok(())
}

fn require_installed(install_dir: &Path) -> Result<()> {
    let compose = install_dir.join("docker-compose.yml");
    let env_path = assets::env_file(install_dir);
    if !is_regular_file(&compose) || !is_regular_file(&env_path) {
        bail!("尚未安装，请先执行 imyemail install");
    }
    Ok(())
}

fn validate_storage_paths(install_dir: &Path) -> Result<()> {
    for path in [install_dir.join("data"), install_dir.join("data/backups")] {
        if !fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_dir()) {
            bail!("数据目录缺失或是符号链接：{}", path.display());
        }
    }
    let database = install_dir.join("data/imyemail.db");
    if database.exists() && !is_regular_file(&database) {
        bail!(
            "数据库必须是普通文件且不能是符号链接：{}",
            database.display()
        );
    }
    Ok(())
}

fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_file())
}

fn acquire_operation_lock() -> Result<fs::File> {
    let lock_dir = Path::new("/run/lock");
    if fs::symlink_metadata(lock_dir).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        bail!("操作锁目录不能是符号链接：{}", lock_dir.display());
    }
    fs::create_dir_all(lock_dir)?;
    let lock_path = lock_dir.join("imyemail.lock");
    if lock_path.exists() && fs::symlink_metadata(&lock_path)?.file_type().is_symlink() {
        bail!("操作锁文件不能是符号链接：{}", lock_path.display());
    }
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .open(&lock_path)?;
    lock.try_lock_exclusive()
        .context("已有另一个 imyemail 管理操作正在运行")?;
    Ok(lock)
}

fn require_managed_marker(install_dir: &Path) -> Result<()> {
    let marker = install_dir.join(assets::MANAGED_MARKER);
    let valid = fs::symlink_metadata(&marker).is_ok_and(|metadata| metadata.is_file())
        && fs::read_to_string(&marker).is_ok_and(|contents| contents == "managed-by=imyemail\n");
    if !valid {
        bail!("安装目录缺少管理标记，拒绝永久删除");
    }
    Ok(())
}

fn input_value(key: &str, prompt: &str, default: Option<&str>) -> Result<String> {
    if let Ok(value) = env::var(key) {
        if !value.trim().is_empty() {
            envfile::validate_value(&value)?;
            return Ok(value.trim().to_owned());
        }
    }
    if let Ok(tty) = fs::OpenOptions::new().read(true).open("/dev/tty") {
        let mut writer = fs::OpenOptions::new().write(true).open("/dev/tty")?;
        match default {
            Some(default) => write!(writer, "{prompt} [{default}]: ")?,
            None => write!(writer, "{prompt}: ")?,
        }
        writer.flush()?;
        let mut value = String::new();
        BufReader::new(tty).read_line(&mut value)?;
        let value = value.trim();
        if value.is_empty() {
            if let Some(default) = default {
                return Ok(default.to_owned());
            }
        } else {
            envfile::validate_value(value)?;
            return Ok(value.to_owned());
        }
    }
    default
        .map(str::to_owned)
        .context(format!("非交互安装必须设置环境变量 {key}"))
}

fn password_value() -> Result<(String, bool)> {
    if let Ok(value) = env::var("IMYEMAIL_ADMIN_PASSWORD") {
        if !value.is_empty() {
            envfile::validate_value(&value)?;
            return Ok((value, false));
        }
    }
    let tty_available = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open("/dev/tty")
        .is_ok();
    if std::io::stdin().is_terminal() || tty_available {
        let password =
            rpassword::prompt_password("初始管理员密码（留空自动生成，输入不会显示）: ")?;
        if !password.is_empty() {
            return Ok((password, false));
        }
    }
    Ok((random_secret()?, true))
}

fn random_secret() -> Result<String> {
    let mut bytes = [0_u8; 24];
    fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    let mut secret = String::with_capacity(48);
    for byte in bytes {
        write!(&mut secret, "{byte:02x}")?;
    }
    Ok(secret)
}

fn validate_hostname(value: &str) -> Result<()> {
    if value.len() > 253 || !value.contains('.') {
        bail!("邮件服务器域名格式不正确");
    }
    let labels: Vec<_> = value.split('.').collect();
    if labels.iter().any(|label| {
        label.is_empty()
            || label.len() > 63
            || label.starts_with('-')
            || label.ends_with('-')
            || !label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    }) || labels.last().is_none_or(|label| {
        label.len() < 2 || !label.bytes().all(|byte| byte.is_ascii_alphabetic())
    }) {
        bail!("邮件服务器域名格式不正确");
    }
    Ok(())
}

fn validate_public_url(value: &str) -> Result<()> {
    let url = Url::parse(value).context("Webmail 访问地址格式不正确")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!("Webmail 访问地址必须是无凭据、查询和片段的 HTTP(S) URL");
    }
    Ok(())
}

fn validate_username(value: &str) -> Result<()> {
    let valid = (2..=80).contains(&value.len())
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric()
                || (index > 0 && matches!(byte, b'.' | b'_' | b'%' | b'+' | b'-'))
        })
        && !value.contains('@');
    if !valid {
        bail!("管理员用户名格式不正确，需为 2-80 位且不能包含 @");
    }
    Ok(())
}

fn validate_image_reference(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 255
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b':' | b'.' | b'_' | b'-' | b'@')
        })
    {
        bail!("回滚镜像引用无效");
    }
    Ok(())
}

fn confirm_purge(install_dir: &Path) -> Result<()> {
    let tty = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open("/dev/tty")
        .context("永久删除需要交互确认；自动化环境请同时传入 --purge --yes")?;
    let mut writer = tty.try_clone()?;
    write!(
        writer,
        "将永久删除 {} 内的全部邮件、数据库、私钥和备份。请输入 DELETE 确认: ",
        install_dir.display()
    )?;
    writer.flush()?;
    let mut answer = String::new();
    BufReader::new(tty).read_line(&mut answer)?;
    if answer.trim() != "DELETE" {
        bail!("已取消永久删除");
    }
    Ok(())
}

fn remove_installed_command() -> Result<()> {
    let path = self_update::installed_path();
    self_update::validate_installed_path(&path)?;
    if path.is_file() {
        if !self_update::running_installed_binary() {
            warn(&format!(
                "当前运行的不是已安装管理器，出于安全考虑保留管理命令：{}",
                path.display()
            ));
            return Ok(());
        }
        fs::remove_file(&path).with_context(|| format!("删除管理命令失败：{}", path.display()))?;
        success(&format!("管理命令已删除：{}", path.display()));
    }
    Ok(())
}

fn log(message: &str) {
    println!("\x1b[1;34m[imyemail]\x1b[0m {message}");
}

fn success(message: &str) {
    println!("\x1b[1;32m[完成]\x1b[0m {message}");
}

fn warn(message: &str) {
    eprintln!("\x1b[1;33m[提示]\x1b[0m {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_hostname_username_and_url() {
        assert!(validate_hostname("mail.example.com").is_ok());
        assert!(validate_hostname("-mail.example.com").is_err());
        assert!(validate_hostname("localhost").is_err());
        assert!(validate_username("admin_01").is_ok());
        assert!(validate_username("a").is_err());
        assert!(validate_username("admin@example.com").is_err());
        assert!(validate_public_url("https://mail.example.com/webmail").is_ok());
        assert!(validate_public_url("https://user:pass@mail.example.com").is_err());
        assert!(validate_public_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn parses_supported_health_bindings() {
        assert_eq!(health_port("80").unwrap(), 80);
        assert_eq!(health_port("127.0.0.1:8088").unwrap(), 8088);
        assert_eq!(health_port("[::1]:8443").unwrap(), 8443);
        assert!(health_port("localhost").is_err());
        assert!(health_port("127.0.0.1:99999").is_err());
    }

    #[test]
    fn validates_rollback_image_reference() {
        assert!(validate_image_reference("imyemail:rollback-20260803").is_ok());
        assert!(validate_image_reference("image;touch /tmp/pwned").is_err());
        assert!(validate_image_reference("line\nbreak").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_in_managed_storage_and_deployment_files() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        fs::create_dir_all(directory.path().join("data/backups")).unwrap();
        let outside = directory.path().join("outside");
        fs::write(&outside, b"database").unwrap();
        symlink(&outside, directory.path().join("data/imyemail.db")).unwrap();
        assert!(validate_storage_paths(directory.path()).is_err());

        fs::write(directory.path().join(".env"), b"KEY=value\n").unwrap();
        symlink(&outside, directory.path().join("docker-compose.yml")).unwrap();
        assert!(require_installed(directory.path()).is_err());

        let env_target = directory.path().join("real-env");
        fs::write(&env_target, b"IMYEMAIL_ADMIN_PASSWORD=secure-password\n").unwrap();
        fs::remove_file(directory.path().join(".env")).unwrap();
        symlink(&env_target, directory.path().join(".env")).unwrap();
        assert!(configure_first_install(directory.path()).is_err());
    }

    #[test]
    fn rejects_incomplete_existing_first_install_configuration() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir_all(directory.path().join("data")).unwrap();
        fs::write(directory.path().join(".env"), b"IMYEMAIL_ADMIN_PASSWORD=\n").unwrap();
        assert!(configure_first_install(directory.path()).is_err());
        fs::write(
            directory.path().join(".env"),
            b"IMYEMAIL_ADMIN_PASSWORD=ChangeMe123!\n",
        )
        .unwrap();
        assert!(configure_first_install(directory.path()).is_err());
    }
}
