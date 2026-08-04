use std::{env, net::SocketAddr};

use thiserror::Error;
use url::Url;

const DEFAULT_ADDR: &str = "127.0.0.1:8081";
const DEFAULT_LEGACY_URL: &str = "http://127.0.0.1:8080/";

#[derive(Clone, Debug)]
pub struct Config {
    pub addr: SocketAddr,
    pub legacy_base_url: Url,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("IMYEMAIL_RUST_ADDR must be a valid socket address: {0}")]
    InvalidAddr(String),
    #[error("IMYEMAIL_LEGACY_API_URL must be a valid URL")]
    InvalidLegacyUrl,
    #[error("IMYEMAIL_LEGACY_API_URL must use http or https")]
    UnsupportedLegacyScheme,
    #[error("IMYEMAIL_LEGACY_API_URL must not contain credentials, query, or fragment")]
    UnsafeLegacyUrl,
    #[error("IMYEMAIL_LEGACY_API_URL must not contain a path prefix")]
    LegacyPathPrefix,
    #[error("IMYEMAIL_RUST_ADDR and IMYEMAIL_LEGACY_API_URL resolve to the same address")]
    ProxyLoop,
}

impl Config {
    /// Loads the Rust edge address and legacy API URL from the environment.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError`] when either value is invalid or would create a
    /// proxy loop.
    pub fn from_env() -> Result<Self, ConfigError> {
        let addr = env::var("IMYEMAIL_RUST_ADDR").unwrap_or_else(|_| DEFAULT_ADDR.to_owned());
        let legacy =
            env::var("IMYEMAIL_LEGACY_API_URL").unwrap_or_else(|_| DEFAULT_LEGACY_URL.to_owned());
        Self::parse(&addr, &legacy)
    }

    /// Parses and validates an edge address and legacy API URL.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError`] for malformed or unsafe values, including URLs
    /// containing credentials and configurations that point back to the edge.
    pub fn parse(addr: &str, legacy: &str) -> Result<Self, ConfigError> {
        let addr = addr
            .trim()
            .parse::<SocketAddr>()
            .map_err(|_| ConfigError::InvalidAddr(addr.to_owned()))?;
        let mut legacy_base_url =
            Url::parse(legacy.trim()).map_err(|_| ConfigError::InvalidLegacyUrl)?;

        if !matches!(legacy_base_url.scheme(), "http" | "https") {
            return Err(ConfigError::UnsupportedLegacyScheme);
        }
        if !legacy_base_url.username().is_empty()
            || legacy_base_url.password().is_some()
            || legacy_base_url.query().is_some()
            || legacy_base_url.fragment().is_some()
        {
            return Err(ConfigError::UnsafeLegacyUrl);
        }
        if !matches!(legacy_base_url.path(), "" | "/") {
            return Err(ConfigError::LegacyPathPrefix);
        }
        legacy_base_url.set_path("/");

        if legacy_base_url.scheme() == "http"
            && legacy_base_url
                .host_str()
                .is_some_and(|host| points_to_listener(host, addr))
            && legacy_base_url.port_or_known_default() == Some(addr.port())
        {
            return Err(ConfigError::ProxyLoop);
        }

        Ok(Self {
            addr,
            legacy_base_url,
        })
    }
}

fn points_to_listener(host: &str, listener: SocketAddr) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return listener.ip().is_loopback() || listener.ip().is_unspecified();
    }
    host.trim_matches(['[', ']'])
        .parse::<std::net::IpAddr>()
        .is_ok_and(|upstream| {
            upstream == listener.ip()
                || listener.ip().is_unspecified()
                || (upstream.is_loopback() && listener.ip().is_loopback())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_safe_config() {
        let config = Config::parse("127.0.0.1:8081", "http://127.0.0.1:8080").unwrap();
        assert_eq!(config.addr.port(), 8081);
        assert_eq!(config.legacy_base_url.as_str(), "http://127.0.0.1:8080/");
    }

    #[test]
    fn rejects_proxy_loop() {
        let error = Config::parse("127.0.0.1:8080", "http://localhost:8080").unwrap_err();
        assert!(matches!(error, ConfigError::ProxyLoop));
        let error = Config::parse("0.0.0.0:8080", "http://127.0.0.1:8080").unwrap_err();
        assert!(matches!(error, ConfigError::ProxyLoop));
    }

    #[test]
    fn rejects_credentials_and_path_prefixes() {
        assert!(matches!(
            Config::parse("127.0.0.1:8081", "http://user:secret@localhost:8080"),
            Err(ConfigError::UnsafeLegacyUrl)
        ));
        assert!(matches!(
            Config::parse("127.0.0.1:8081", "http://localhost:8080/api"),
            Err(ConfigError::LegacyPathPrefix)
        ));
    }
}
