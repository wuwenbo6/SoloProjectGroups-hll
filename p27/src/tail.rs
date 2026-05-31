use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use notify::{Watcher, RecursiveMode, Event, EventKind};

use crate::index::InvertedIndex;
use crate::storage::{read_file_from_position, get_file_size, CompressedStorage};
use crate::crypto::CryptoManager;
use crate::s3_storage::S3Storage;

struct FileState {
    path: PathBuf,
    position: u64,
    line_count: usize,
    compressed_storage: Option<CompressedStorage>,
}

impl FileState {
    fn new(path: PathBuf, compress: bool, crypto: &CryptoManager) -> Self {
        let compressed_storage = if compress {
            let compressed_path = path.with_extension("zst");
            Some(CompressedStorage::new(compressed_path, crypto.clone()))
        } else {
            None
        };

        FileState {
            path,
            position: 0,
            line_count: 0,
            compressed_storage,
        }
    }

    fn get_compressed_path(&self) -> Option<PathBuf> {
        self.compressed_storage.as_ref().map(|_| self.path.with_extension("zst"))
    }
}

pub async fn start_tailing(
    files: Vec<PathBuf>,
    index: Arc<RwLock<InvertedIndex>>,
    compress: bool,
    crypto: CryptoManager,
    s3: S3Storage,
    s3_sync_interval: u64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut file_states: HashMap<PathBuf, FileState> = HashMap::new();
    let s3 = Arc::new(s3);
    
    for file in &files {
        if file.exists() {
            let mut state = FileState::new(file.clone(), compress, &crypto);
            process_existing_file(&mut state, index.clone()).await?;
            file_states.insert(file.clone(), state);
        } else {
            let state = FileState::new(file.clone(), compress, &crypto);
            file_states.insert(file.clone(), state);
        }
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.blocking_send(event);
        }
    })?;

    for file in &files {
        if let Some(parent) = file.parent() {
            watcher.watch(parent, RecursiveMode::NonRecursive)?;
        }
    }

    println!("Tailing files: {:?}", files);

    let s3_files: Vec<PathBuf> = file_states
        .values()
        .filter_map(|s| s.get_compressed_path())
        .collect();
    
    let s3_clone = s3.clone();
    tokio::spawn(async move {
        if s3_clone.is_enabled() {
            loop {
                tokio::time::sleep(Duration::from_secs(s3_sync_interval)).await;
                if let Err(e) = s3_clone.sync_to_s3(&s3_files).await {
                    eprintln!("S3 sync failed: {}", e);
                }
            }
        }
    });

    while let Some(event) = rx.recv().await {
        match event.kind {
            EventKind::Modify(_) | EventKind::Create(_) => {
                for path in event.paths {
                    if let Some(state) = file_states.get_mut(&path) {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        process_file_changes(state, index.clone()).await?;
                        
                        if s3.is_enabled() {
                            if let Some(compressed_path) = state.get_compressed_path() {
                                if compressed_path.exists() {
                                    let s3 = s3.clone();
                                    tokio::spawn(async move {
                                        if let Err(e) = s3.upload_file(&compressed_path).await {
                                            eprintln!("S3 upload failed: {}", e);
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}

async fn process_existing_file(
    state: &mut FileState,
    index: Arc<RwLock<InvertedIndex>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let lines = read_file_from_position(&state.path, state.position)?;
    process_lines(state, lines, index.clone()).await?;
    Ok(())
}

async fn process_file_changes(
    state: &mut FileState,
    index: Arc<RwLock<InvertedIndex>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let current_size = get_file_size(&state.path)?;
    
    if current_size < state.position {
        state.position = 0;
        state.line_count = 0;
    }

    if current_size > state.position {
        let lines = read_file_from_position(&state.path, state.position)?;
        process_lines(state, lines, index.clone()).await?;
    }

    Ok(())
}

async fn process_lines(
    state: &mut FileState,
    lines: Vec<String>,
    index: Arc<RwLock<InvertedIndex>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut current_offset = state.position;
    
    for line in lines {
        state.line_count += 1;
        let line_len = line.len() as u64 + 1;
        
        let mut index_guard = index.write().await;
        index_guard.add_line(
            state.path.clone(),
            state.line_count,
            line.clone(),
            current_offset as usize,
        );
        drop(index_guard);

        if let Some(storage) = &mut state.compressed_storage {
            storage.append_compressed(&line)?;
        }

        current_offset += line_len;
    }

    state.position = current_offset;
    println!("File {:?} processed, total lines: {}", state.path, state.line_count);
    
    Ok(())
}
