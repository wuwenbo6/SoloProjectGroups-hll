use axum::{
    extract::{Path, State, Query},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use crate::efivar::{EfiVarError, EfiVarManager, EfiVariable};

#[derive(Clone)]
struct AppState {
    manager: Arc<EfiVarManager>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateVarRequest {
    name: String,
    guid: String,
    attributes: u32,
    data: String,
    hex_input: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateVarRequest {
    data: String,
    hex_input: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct DeleteVarRequest {
    force: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RestoreRequest {
    force: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RestoreQuery {
    force: Option<bool>,
}

#[derive(Debug, Serialize)]
struct BootEntry {
    index: u16,
    name: String,
    active: bool,
}

#[derive(Debug, Deserialize)]
struct BootOrderRequest {
    order: Vec<u16>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(msg: String) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

fn map_error(e: EfiVarError) -> (StatusCode, Json<ApiResponse<()>>) {
    let status = match e {
        EfiVarError::NotFound => StatusCode::NOT_FOUND,
        EfiVarError::InvalidName | EfiVarError::InvalidData => StatusCode::BAD_REQUEST,
        EfiVarError::PermissionDenied => StatusCode::FORBIDDEN,
        EfiVarError::ReadOnly => StatusCode::FORBIDDEN,
        EfiVarError::ForceRequired => StatusCode::FORBIDDEN,
        EfiVarError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(ApiResponse::error(e.to_string())))
}

async fn list_vars(State(state): State<AppState>) -> impl IntoResponse {
    let vars = state.manager.list_variables();
    Json(ApiResponse::success(vars))
}

async fn get_var(
    State(state): State<AppState>,
    Path((name, guid)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.manager.get_variable(&name, &guid) {
        Ok(var) => (StatusCode::OK, Json(ApiResponse::success(var))),
        Err(e) => map_error(e),
    }
}

async fn create_var(
    State(state): State<AppState>,
    Json(req): Json<CreateVarRequest>,
) -> impl IntoResponse {
    let data = if req.hex_input.unwrap_or(false) {
        match hex::decode(&req.data) {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::error("Invalid hex data".to_string()))),
        }
    } else {
        req.data.into_bytes()
    };

    match state.manager.create_variable(&req.name, &req.guid, req.attributes, &data) {
        Ok(var) => (StatusCode::CREATED, Json(ApiResponse::success(var))),
        Err(e) => map_error(e),
    }
}

async fn update_var(
    State(state): State<AppState>,
    Path((name, guid)): Path<(String, String)>,
    Json(req): Json<UpdateVarRequest>,
) -> impl IntoResponse {
    let data = if req.hex_input.unwrap_or(false) {
        match hex::decode(&req.data) {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::error("Invalid hex data".to_string()))),
        }
    } else {
        req.data.into_bytes()
    };

    match state.manager.update_variable(&name, &guid, &data) {
        Ok(()) => {
            match state.manager.get_variable(&name, &guid) {
                Ok(var) => (StatusCode::OK, Json(ApiResponse::success(var))),
                Err(e) => map_error(e),
            }
        },
        Err(e) => map_error(e),
    }
}

async fn delete_var(
    State(state): State<AppState>,
    Path((name, guid)): Path<(String, String)>,
    Json(req): Json<DeleteVarRequest>,
) -> impl IntoResponse {
    match state.manager.delete_variable(&name, &guid, req.force.unwrap_or(false)) {
        Ok(()) => (StatusCode::OK, Json(ApiResponse::success(()))),
        Err(e) => map_error(e),
    }
}

async fn backup_vars(State(state): State<AppState>) -> axum::response::Response {
    let temp_path = std::env::temp_dir().join("efi_backup.bin");
    match state.manager.backup_all(&temp_path) {
        Ok(()) => {
            match std::fs::read(&temp_path) {
                Ok(data) => {
                    let _ = std::fs::remove_file(&temp_path);
                    axum::http::Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/octet-stream")
                        .header("Content-Disposition", "attachment; filename=\"efivars_backup.bin\"")
                        .body(axum::body::Body::from(data))
                        .unwrap()
                }
                Err(_) => axum::http::Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(
                        serde_json::to_vec(&ApiResponse::<()>::error("Failed to read backup".to_string())).unwrap_or_default()
                    ))
                    .unwrap(),
            }
        }
        Err(e) => axum::http::Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::to_vec(&ApiResponse::<()>::error(e.to_string())).unwrap_or_default()
            ))
            .unwrap(),
    }
}

async fn restore_vars(
    State(state): State<AppState>,
    Query(query): Query<RestoreQuery>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let temp_path = std::env::temp_dir().join("efi_restore.bin");
    
    if let Err(e) = std::fs::write(&temp_path, body) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<Vec<String>>::error(e.to_string())));
    }
    
    match state.manager.restore_all(&temp_path, query.force.unwrap_or(false)) {
        Ok(restored) => {
            let _ = std::fs::remove_file(&temp_path);
            (StatusCode::OK, Json(ApiResponse::success(restored)))
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<Vec<String>>::error(e.to_string())))
        }
    }
}

async fn get_boot_order(State(state): State<AppState>) -> impl IntoResponse {
    const BOOT_GUID: &str = "8be4df61-93ca-11d2-aa0d-00e098032b8c";
    
    let mut boot_order = Vec::new();
    let mut boot_entries = Vec::new();
    
    if let Ok(boot_order_var) = state.manager.get_variable("BootOrder", BOOT_GUID) {
        let data = &boot_order_var.data;
        for chunk in data.chunks(2) {
            if chunk.len() == 2 {
                let idx = u16::from_le_bytes([chunk[0], chunk[1]]);
                boot_order.push(idx);
                
                let boot_name = format!("Boot{:04X}", idx);
                if let Ok(boot_var) = state.manager.get_variable(&boot_name, BOOT_GUID) {
                    if boot_var.data.len() > 6 {
                        let desc_start = 6;
                        let desc_bytes: Vec<u16> = boot_var.data[desc_start..]
                            .chunks(2)
                            .take_while(|c| c.len() == 2 && (c[0] != 0 || c[1] != 0))
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .collect();
                        let name = String::from_utf16_lossy(&desc_bytes);
                        boot_entries.push(BootEntry {
                            index: idx,
                            name,
                            active: true,
                        });
                    }
                }
            }
        }
    }
    
    (StatusCode::OK, Json(ApiResponse::success(boot_entries)))
}

async fn set_boot_order(
    State(state): State<AppState>,
    Json(req): Json<BootOrderRequest>,
) -> impl IntoResponse {
    const BOOT_GUID: &str = "8be4df61-93ca-11d2-aa0d-00e098032b8c";
    
    let mut data = Vec::with_capacity(req.order.len() * 2);
    for idx in &req.order {
        data.extend_from_slice(&idx.to_le_bytes());
    }
    
    match state.manager.set_variable("BootOrder", BOOT_GUID, 7, &data) {
        Ok(_) => (StatusCode::OK, Json(ApiResponse::success(()))),
        Err(e) => map_error(e),
    }
}

pub fn run_server(host: String, port: u16, store_path: Option<PathBuf>) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let manager = if let Some(path) = store_path {
            Arc::new(EfiVarManager::with_persistence(path).unwrap())
        } else {
            Arc::new(EfiVarManager::new())
        };

        let state = AppState { manager };

        let app = Router::new()
            .route("/api/vars", get(list_vars))
            .route("/api/vars", post(create_var))
            .route("/api/vars/:name/:guid", get(get_var))
            .route("/api/vars/:name/:guid", put(update_var))
            .route("/api/vars/:name/:guid", delete(delete_var))
            .route("/api/backup", get(backup_vars))
            .route("/api/restore", post(restore_vars))
            .route("/api/boot/order", get(get_boot_order))
            .route("/api/boot/order", post(set_boot_order))
            .with_state(state)
            .fallback(fallback);

        let addr: SocketAddr = format!("{}:{}", host, port).parse().unwrap();
        println!("Server running on http://{}", addr);
        
        axum::Server::bind(&addr)
            .serve(app.into_make_service())
            .await
            .unwrap();
    });
}

async fn fallback() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, Json(ApiResponse::<()>::error("Not found".to_string())))
}
