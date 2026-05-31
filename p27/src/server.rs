use axum::{
    extract::{Query, State},
    http::{StatusCode, HeaderMap, header},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

use crate::index::{InvertedIndex, SearchResult, SearchLine};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    q: String,
    #[serde(default = "default_context")]
    context: usize,
}

fn default_context() -> usize {
    2
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    q: Option<String>,
    #[serde(default)]
    file: Option<String>,
    #[serde(default)]
    start_line: Option<usize>,
    #[serde(default)]
    end_line: Option<usize>,
    #[serde(default = "default_format")]
    format: String,
}

fn default_format() -> String {
    "json".to_string()
}

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct FileInfo {
    path: PathBuf,
}

struct AppState {
    index: Arc<RwLock<InvertedIndex>>,
    files: Vec<PathBuf>,
}

pub async fn start_server(
    host: String,
    port: u16,
    index: Arc<RwLock<InvertedIndex>>,
    files: Vec<PathBuf>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = Arc::new(AppState {
        index: index.clone(),
        files: files.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/search", get(search_handler))
        .route("/api/export", get(export_handler))
        .route("/api/files", get(files_handler))
        .route("/api/health", get(health_handler))
        .nest_service("/", ServeDir::new("static"))
        .layer(cors)
        .with_state(state);

    let addr = format!("{}:{}", host, port);
    println!("Server running on http://{}", addr);
    println!("Web interface: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn search_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    if query.q.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<SearchResult> {
                success: false,
                data: None,
                error: Some("Query parameter 'q' is required".to_string()),
            }),
        );
    }

    let index_guard = state.index.read().await;
    let result = index_guard.search(&query.q, query.context);

    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: Some(result),
            error: None,
        }),
    )
}

async fn files_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let files: Vec<FileInfo> = state
        .files
        .iter()
        .map(|f| FileInfo { path: f.clone() })
        .collect();

    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: Some(files),
            error: None,
        }),
    )
}

async fn health_handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse::<String> {
            success: true,
            data: Some("ok".to_string()),
            error: None,
        }),
    )
}

#[derive(Debug, Serialize)]
struct ExportResult {
    total_lines: usize,
    lines: Vec<ExportLine>,
}

#[derive(Debug, Serialize)]
struct ExportLine {
    file: PathBuf,
    line_number: usize,
    content: String,
}

async fn export_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> impl IntoResponse {
    let index_guard = state.index.read().await;
    
    let lines: Vec<ExportLine> = if let Some(q) = &query.q {
        let result = index_guard.search(q, 0);
        result.lines
            .into_iter()
            .map(|l| ExportLine {
                file: l.file,
                line_number: l.line_number,
                content: l.content,
            })
            .collect()
    } else {
        let mut all_lines = Vec::new();
        for file in &state.files {
            let file_path = PathBuf::from(file);
            let max_line = index_guard.get_file_max_line(&file_path);
            let start = query.start_line.unwrap_or(1);
            let end = query.end_line.unwrap_or(max_line);
            
            for line_num in start..=end {
                if let Some(content) = index_guard.get_line(&file_path, line_num) {
                    all_lines.push(ExportLine {
                        file: file_path.clone(),
                        line_number: line_num,
                        content,
                    });
                }
            }
        }
        all_lines
    };

    let result = ExportResult {
        total_lines: lines.len(),
        lines,
    };

    let format = query.format.to_lowercase();
    match format.as_str() {
        "json" => {
            let json = serde_json::to_string_pretty(&result).unwrap_or_default();
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                "application/json; charset=utf-8".parse().unwrap(),
            );
            headers.insert(
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"export.json\"".parse().unwrap(),
            );
            (headers, json)
        }
        "txt" | "text" => {
            let text: Vec<String> = result.lines
                .iter()
                .map(|l| format!("[{}:{}] {}", l.file.display(), l.line_number, l.content))
                .collect();
            let text = text.join("\n");
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                "text/plain; charset=utf-8".parse().unwrap(),
            );
            headers.insert(
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"export.txt\"".parse().unwrap(),
            );
            (headers, text)
        }
        "csv" => {
            let mut csv = String::from("file,line_number,content\n");
            for line in &result.lines {
                let content = line.content.replace("\"", "\"\"");
                csv.push_str(&format!(
                    "\"{}\",{},\"{}\"\n",
                    line.file.display(),
                    line.line_number,
                    content
                ));
            }
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                "text/csv; charset=utf-8".parse().unwrap(),
            );
            headers.insert(
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"export.csv\"".parse().unwrap(),
            );
            (headers, csv)
        }
        _ => {
            let json = serde_json::to_string_pretty(&ApiResponse::<()> {
                success: false,
                data: None,
                error: Some(format!("Unsupported format: {}. Use json, txt, or csv", query.format)),
            }).unwrap_or_default();
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                "application/json; charset=utf-8".parse().unwrap(),
            );
            (headers, json)
        }
    }
}
