use crate::fm_index::{FMIndex, sam_header};
use crate::query::{exact_query, approximate_query, gapped_query, QueryResult, to_sam};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, Json, Response, IntoResponse},
    routing::get,
    Router,
    body::Full,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

#[derive(Deserialize)]
pub struct SearchParams {
    pattern: String,
    #[serde(default)]
    mismatches: usize,
    #[serde(default = "default_true")]
    rc: bool,
    #[serde(default)]
    gapped: bool,
    #[serde(default)]
    max_edit: usize,
    #[serde(default)]
    format: String,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize)]
pub struct SearchResponse {
    success: bool,
    count: usize,
    results: Vec<QueryResultDto>,
    message: Option<String>,
}

#[derive(Serialize)]
pub struct QueryResultDto {
    record_name: String,
    position: usize,
    edit_distance: usize,
    strand: char,
    alignment: Option<AlignmentDto>,
}

#[derive(Serialize)]
pub struct AlignmentDto {
    query: String,
    reference: String,
    cigar: String,
}

#[derive(Serialize)]
pub struct IndexInfo {
    total_records: usize,
    total_length: u32,
    is_rna: bool,
    memory_mb: f64,
    records: Vec<RecordInfo>,
}

#[derive(Serialize)]
pub struct RecordInfo {
    name: String,
    description: String,
    length: u32,
}

struct AppState {
    fm_index: FMIndex,
}

impl From<&QueryResult> for QueryResultDto {
    fn from(r: &QueryResult) -> Self {
        QueryResultDto {
            record_name: r.record_name.clone(),
            position: r.position,
            edit_distance: r.mismatches,
            strand: r.strand,
            alignment: r.alignment.as_ref().map(|aln| {
                let mut cigar = String::new();
                let mut current_op = None;
                let mut count = 0;
                for &op in &aln.edits {
                    let op_char = match op {
                        crate::fm_index::EditOp::Match | crate::fm_index::EditOp::Mismatch => 'M',
                        crate::fm_index::EditOp::Insertion => 'I',
                        crate::fm_index::EditOp::Deletion => 'D',
                    };
                    if current_op == Some(op_char) {
                        count += 1;
                    } else {
                        if let Some(c) = current_op {
                            cigar.push_str(&format!("{}{}", count, c));
                        }
                        current_op = Some(op_char);
                        count = 1;
                    }
                }
                if let Some(c) = current_op {
                    cigar.push_str(&format!("{}{}", count, c));
                }
                
                AlignmentDto {
                    query: String::from_utf8_lossy(&aln.query).to_string(),
                    reference: String::from_utf8_lossy(&aln.reference).to_string(),
                    cigar,
                }
            }),
        }
    }
}

async fn search_exact(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Result<Response, StatusCode> {
    let pattern = params.pattern.to_ascii_uppercase();
    
    if pattern.is_empty() {
        return Ok(Json(SearchResponse {
            success: false,
            count: 0,
            results: Vec::new(),
            message: Some("查询序列不能为空".to_string()),
        }).into_response());
    }

    let pattern_bytes = pattern.as_bytes();
    
    if !is_valid_nucleic_acid(pattern_bytes) {
        return Ok(Json(SearchResponse {
            success: false,
            count: 0,
            results: Vec::new(),
            message: Some("查询序列包含无效字符，只允许 A, T, U, C, G, N".to_string()),
        }).into_response());
    }

    let results = exact_query(&state.fm_index, pattern_bytes, params.rc);

    if params.format == "sam" {
        let sam = format_sam_response(&results, &state.fm_index, "query", pattern_bytes);
        return Ok(sam_response(sam));
    }

    let results_dto: Vec<QueryResultDto> = results.iter().map(|r| r.into()).collect();

    Ok(Json(SearchResponse {
        success: true,
        count: results.len(),
        results: results_dto,
        message: None,
    }).into_response())
}

async fn search_approx(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Result<Response, StatusCode> {
    let pattern = params.pattern.to_ascii_uppercase();
    
    if pattern.is_empty() {
        return Ok(Json(SearchResponse {
            success: false,
            count: 0,
            results: Vec::new(),
            message: Some("查询序列不能为空".to_string()),
        }).into_response());
    }

    let pattern_bytes = pattern.as_bytes();
    
    if !is_valid_nucleic_acid(pattern_bytes) {
        return Ok(Json(SearchResponse {
            success: false,
            count: 0,
            results: Vec::new(),
            message: Some("查询序列包含无效字符，只允许 A, T, U, C, G, N".to_string()),
        }).into_response());
    }

    let results = if params.gapped {
        gapped_query(&state.fm_index, pattern_bytes, params.max_edit.max(params.mismatches), params.rc)
    } else {
        approximate_query(&state.fm_index, pattern_bytes, params.mismatches, params.rc)
    };

    if params.format == "sam" {
        let sam = format_sam_response(&results, &state.fm_index, "query", pattern_bytes);
        return Ok(sam_response(sam));
    }

    let results_dto: Vec<QueryResultDto> = results.iter().map(|r| r.into()).collect();

    Ok(Json(SearchResponse {
        success: true,
        count: results.len(),
        results: results_dto,
        message: None,
    }).into_response())
}

fn is_valid_nucleic_acid(seq: &[u8]) -> bool {
    seq.iter().all(|&c| matches!(c, b'A' | b'T' | b'U' | b'C' | b'G' | b'N'))
}

fn format_sam_response(results: &[QueryResult], fm: &FMIndex, query_name: &str, pattern: &[u8]) -> String {
    let mut sam = sam_header(&fm.records);
    sam.push_str(&to_sam(results, fm, query_name, pattern));
    sam
}

fn sam_response(sam: String) -> Response {
    Response::builder()
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=\"alignment.sam\"")
        .body(Full::from(sam))
        .unwrap()
        .into_response()
}

async fn get_index_info(
    State(state): State<Arc<AppState>>,
) -> Json<IndexInfo> {
    let records: Vec<RecordInfo> = state
        .fm_index
        .records
        .iter()
        .map(|r| RecordInfo {
            name: r.name.clone(),
            description: r.description.clone(),
            length: r.length,
        })
        .collect();

    Json(IndexInfo {
        total_records: state.fm_index.records.len(),
        total_length: state.fm_index.total_length,
        is_rna: state.fm_index.is_rna,
        memory_mb: state.fm_index.memory_usage() as f64 / 1024.0 / 1024.0,
        records,
    })
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

pub async fn run_server(fm_index: FMIndex, host: String, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let state = Arc::new(AppState { fm_index });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(index))
        .route("/api/info", get(get_index_info))
        .route("/api/search/exact", get(search_exact))
        .route("/api/search/approx", get(search_approx))
        .layer(cors)
        .with_state(state);

    let addr = format!("{}:{}", host, port);
    println!("服务器启动在 http://{}", addr);
    println!("API 端点:");
    println!("  GET /api/info - 获取索引信息");
    println!("  GET /api/search/exact - 精确匹配查询");
    println!("  GET /api/search/approx - 近似匹配查询 (支持gap)");
    println!("  参数: pattern, mismatches, rc, gapped, max_edit, format=sam");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
