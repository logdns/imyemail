mod config;
mod proxy;

use std::time::Duration;

use axum::{Json, Router, routing::get};
use chrono::Utc;
use reqwest::redirect::Policy;
use serde::Serialize;
use url::Url;

pub use config::{Config, ConfigError};

#[derive(Clone)]
pub struct AppState {
    client: reqwest::Client,
    legacy_base_url: Url,
}

impl AppState {
    /// Builds application state with a redirect-disabled, streaming HTTP client.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying HTTP client cannot be constructed.
    pub fn new(legacy_base_url: Url) -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .redirect(Policy::none())
            .build()?;
        Ok(Self {
            client,
            legacy_base_url,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    time: chrono::DateTime<Utc>,
    implementation: &'static str,
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/readyz", get(proxy::ready))
        .fallback(proxy::forward)
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        time: Utc::now(),
        implementation: "rust",
    })
}

#[cfg(test)]
mod tests {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn health_is_native_and_does_not_require_legacy_api() {
        let state = AppState::new(Url::parse("http://127.0.0.1:1/").unwrap()).unwrap();
        let response = build_router(state)
            .oneshot(Request::get("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(response.status().is_success());
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["implementation"], "rust");
    }
}
