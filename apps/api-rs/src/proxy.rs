use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderMap, HeaderName, Request, Response, StatusCode, Uri, header},
    response::IntoResponse,
};
use serde::Serialize;
use tracing::error;

use crate::AppState;

const HOP_BY_HOP_HEADERS: [HeaderName; 8] = [
    header::CONNECTION,
    HeaderName::from_static("keep-alive"),
    header::PROXY_AUTHENTICATE,
    header::PROXY_AUTHORIZATION,
    header::TE,
    header::TRAILER,
    header::TRANSFER_ENCODING,
    header::UPGRADE,
];

#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
}

pub async fn forward(State(state): State<AppState>, request: Request<Body>) -> Response<Body> {
    let path = request.uri().path().to_owned();
    match try_forward(&state, request).await {
        Ok(response) => response,
        Err(error) => {
            log_upstream_error(&path, &error);
            (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: "upstream unavailable",
                }),
            )
                .into_response()
        }
    }
}

async fn try_forward(
    state: &AppState,
    request: Request<Body>,
) -> Result<Response<Body>, reqwest::Error> {
    let (parts, body) = request.into_parts();
    let target = target_url(&state.legacy_base_url, &parts.uri);
    let mut upstream = state
        .client
        .request(parts.method, target)
        .body(reqwest::Body::wrap_stream(body.into_data_stream()));

    for (name, value) in &parts.headers {
        if should_forward_request_header(name, &parts.headers) {
            upstream = upstream.header(name, value);
        }
    }

    let response = upstream.send().await?;
    let status = response.status();
    let headers = response.headers().clone();
    let mut downstream = Response::new(Body::from_stream(response.bytes_stream()));
    *downstream.status_mut() = status;
    copy_response_headers(&headers, downstream.headers_mut());
    Ok(downstream)
}

pub async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    let target = state
        .legacy_base_url
        .join("healthz")
        .expect("validated base URL must join");
    match state.client.get(target).send().await {
        Ok(response) if response.status().is_success() => (
            StatusCode::OK,
            Json(serde_json::json!({"ok": true, "legacy": true})),
        ),
        Ok(response) => {
            error!(status = %response.status(), "legacy API readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"ok": false, "legacy": false})),
            )
        }
        Err(error) => {
            log_upstream_error("/healthz", &error);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"ok": false, "legacy": false})),
            )
        }
    }
}

fn log_upstream_error(path: &str, error: &reqwest::Error) {
    error!(
        path,
        timeout = error.is_timeout(),
        connect = error.is_connect(),
        status = error.status().map(|status| status.as_u16()),
        "legacy API request failed"
    );
}

fn target_url(base: &url::Url, uri: &Uri) -> String {
    let path_and_query = uri
        .path_and_query()
        .map_or(uri.path(), axum::http::uri::PathAndQuery::as_str);
    format!("{}{}", base.as_str().trim_end_matches('/'), path_and_query)
}

fn should_forward_request_header(name: &HeaderName, headers: &HeaderMap) -> bool {
    name != header::HOST && !is_hop_by_hop(name, headers)
}

fn copy_response_headers(source: &HeaderMap, target: &mut HeaderMap) {
    for (name, value) in source {
        if !is_hop_by_hop(name, source) {
            target.append(name, value.clone());
        }
    }
}

fn is_hop_by_hop(name: &HeaderName, headers: &HeaderMap) -> bool {
    HOP_BY_HOP_HEADERS.contains(name)
        || headers.get_all(header::CONNECTION).iter().any(|value| {
            value.to_str().is_ok_and(|value| {
                value
                    .split(',')
                    .any(|token| token.trim().eq_ignore_ascii_case(name.as_str()))
            })
        })
}

#[cfg(test)]
mod tests {
    use axum::{Router, body::Bytes, http::HeaderValue, routing::any};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;
    use crate::{AppState, build_router};

    async fn echo(request: Request<Body>) -> Response<Body> {
        let path = request.uri().path().to_owned();
        let query = request.uri().query().unwrap_or_default().to_owned();
        let method = request.method().as_str().to_owned();
        let custom_header = request
            .headers()
            .get("x-proxy-test")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        let body = request.into_body().collect().await.unwrap().to_bytes();
        let payload = format!(
            "{method}|{path}|{query}|{custom_header}|{}",
            String::from_utf8_lossy(&body)
        );
        let mut response = Response::new(Body::from(payload));
        *response.status_mut() = StatusCode::CREATED;
        response.headers_mut().append(
            header::SET_COOKIE,
            HeaderValue::from_static("first=1; HttpOnly"),
        );
        response.headers_mut().append(
            header::SET_COOKIE,
            HeaderValue::from_static("second=2; Secure"),
        );
        response
    }

    async fn test_state() -> (AppState, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, Router::new().fallback(any(echo)))
                .await
                .unwrap();
        });
        let state = AppState::new(url::Url::parse(&format!("http://{address}/")).unwrap()).unwrap();
        (state, server)
    }

    #[tokio::test]
    async fn preserves_method_query_headers_body_status_and_cookies() {
        let (state, server) = test_state().await;
        let app = build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/a%2Fb?value=a%2Fb")
                    .header("x-proxy-test", "present")
                    .body(Body::from("payload"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        assert_eq!(
            response
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .count(),
            2
        );
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            body,
            Bytes::from_static(b"POST|/api/a%2Fb|value=a%2Fb|present|payload")
        );
        server.abort();
    }

    #[test]
    fn strips_hop_by_hop_headers() {
        let headers = HeaderMap::new();
        assert!(!should_forward_request_header(&header::HOST, &headers));
        assert!(!should_forward_request_header(
            &header::CONNECTION,
            &headers
        ));
        assert!(should_forward_request_header(
            &header::AUTHORIZATION,
            &headers
        ));
    }

    #[test]
    fn strips_headers_named_by_connection() {
        let mut headers = HeaderMap::new();
        headers.insert(header::CONNECTION, HeaderValue::from_static("x-private"));
        assert!(!should_forward_request_header(
            &HeaderName::from_static("x-private"),
            &headers
        ));
    }
}
