use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use jieba_rs::Jieba;
use lazy_static::lazy_static;

lazy_static! {
    static ref JIEBA: Jieba = Jieba::new();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinePosition {
    pub file: PathBuf,
    pub line_number: usize,
    pub byte_offset: usize,
    pub length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub keyword: String,
    pub positions: Vec<LinePosition>,
    pub lines: Vec<SearchLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchLine {
    pub file: PathBuf,
    pub line_number: usize,
    pub content: String,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

pub struct InvertedIndex {
    index: HashMap<String, Vec<LinePosition>>,
    lines: HashMap<(PathBuf, usize), String>,
    file_line_count: HashMap<PathBuf, usize>,
}

impl InvertedIndex {
    pub fn new() -> Self {
        InvertedIndex {
            index: HashMap::new(),
            lines: HashMap::new(),
            file_line_count: HashMap::new(),
        }
    }

    fn tokenize(text: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        
        let has_chinese = text.chars().any(|c| c as u32 >= 0x4E00 && c as u32 <= 0x9FFF);
        
        if has_chinese {
            let jieba_tokens = JIEBA.cut(text, false);
            for token in jieba_tokens {
                let cleaned = token.trim();
                if !cleaned.is_empty() && cleaned.len() > 0 {
                    if cleaned.chars().all(|c| c.is_alphanumeric() || c == '_') {
                        if cleaned.len() >= 2 || Self::is_chinese(cleaned) {
                            tokens.push(cleaned.to_lowercase());
                        }
                    } else if Self::is_chinese(cleaned) && cleaned.chars().count() >= 1 {
                        tokens.push(cleaned.to_string());
                    }
                }
            }
        }
        
        let english_tokens: Vec<&str> = text
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .filter(|s| !s.is_empty() && s.len() >= 2)
            .collect();
        
        for token in english_tokens {
            let token_lower = token.to_lowercase();
            if !tokens.contains(&token_lower) {
                tokens.push(token_lower);
            }
        }
        
        tokens
    }

    fn is_chinese(text: &str) -> bool {
        text.chars().any(|c| c as u32 >= 0x4E00 && c as u32 <= 0x9FFF)
    }

    pub fn add_line(&mut self, file: PathBuf, line_number: usize, content: String, byte_offset: usize) {
        let length = content.len();
        let line_pos = LinePosition {
            file: file.clone(),
            line_number,
            byte_offset,
            length,
        };

        let keywords = Self::tokenize(&content);

        for keyword in keywords {
            self.index
                .entry(keyword)
                .or_insert_with(Vec::new)
                .push(line_pos.clone());
        }

        self.lines.insert((file.clone(), line_number), content);
        
        let count = self.file_line_count.entry(file).or_insert(0);
        if line_number > *count {
            *count = line_number;
        }
    }

    pub fn search(&self, keyword: &str, context_lines: usize) -> SearchResult {
        let mut positions = Vec::new();
        let keyword_lower = keyword.to_lowercase();
        
        if let Some(exact_matches) = self.index.get(&keyword_lower) {
            positions.extend(exact_matches.clone());
        }
        
        let search_tokens = Self::tokenize(keyword);
        for token in search_tokens {
            if token != keyword_lower {
                if let Some(matches) = self.index.get(&token) {
                    positions.extend(matches.clone());
                }
            }
        }
        
        positions.sort_by_key(|p| (p.file.clone(), p.line_number));
        positions.dedup_by_key(|p| (p.file.clone(), p.line_number));
        
        let mut lines = Vec::new();
        for pos in &positions {
            let content = self.lines.get(&(pos.file.clone(), pos.line_number))
                .cloned()
                .unwrap_or_default();
            
            let mut context_before = Vec::new();
            for i in 1..=context_lines {
                if pos.line_number > i {
                    if let Some(ctx) = self.lines.get(&(pos.file.clone(), pos.line_number - i)) {
                        context_before.push(ctx.clone());
                    }
                }
            }
            context_before.reverse();

            let mut context_after = Vec::new();
            let max_line = *self.file_line_count.get(&pos.file).unwrap_or(&0);
            for i in 1..=context_lines {
                let next_line = pos.line_number + i;
                if next_line <= max_line {
                    if let Some(ctx) = self.lines.get(&(pos.file.clone(), next_line)) {
                        context_after.push(ctx.clone());
                    }
                }
            }

            lines.push(SearchLine {
                file: pos.file.clone(),
                line_number: pos.line_number,
                content,
                context_before,
                context_after,
            });
        }

        SearchResult {
            keyword: keyword.to_string(),
            positions,
            lines,
        }
    }

    pub fn get_file_max_line(&self, file: &PathBuf) -> usize {
        *self.file_line_count.get(file).unwrap_or(&0)
    }

    pub fn get_line(&self, file: &PathBuf, line_number: usize) -> Option<String> {
        self.lines.get(&(file.clone(), line_number)).cloned()
    }
}

impl Default for InvertedIndex {
    fn default() -> Self {
        Self::new()
    }
}
