import db from '../db/database.js';
import type { CodeSnippet } from '@shared/types.js';

interface CodeSnippetRow {
  id: number;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

function mapRowToSnippet(row: CodeSnippetRow): CodeSnippet {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllSnippets(): CodeSnippet[] {
  const rows = db
    .prepare('SELECT * FROM code_snippets ORDER BY updated_at DESC')
    .all() as CodeSnippetRow[];
  return rows.map(mapRowToSnippet);
}

export function getSnippetById(id: number): CodeSnippet | null {
  const row = db
    .prepare('SELECT * FROM code_snippets WHERE id = ?')
    .get(id) as CodeSnippetRow | undefined;
  return row ? mapRowToSnippet(row) : null;
}

export function createSnippet(name: string, code: string): CodeSnippet {
  const result = db
    .prepare('INSERT INTO code_snippets (name, code) VALUES (?, ?)')
    .run(name, code);
  const id = result.lastInsertRowid as number;
  return getSnippetById(id)!;
}

export function updateSnippet(id: number, name: string, code: string): CodeSnippet | null {
  const result = db
    .prepare(
      'UPDATE code_snippets SET name = ?, code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .run(name, code, id);
  if (result.changes === 0) return null;
  return getSnippetById(id);
}

export function deleteSnippet(id: number): boolean {
  const result = db
    .prepare('DELETE FROM code_snippets WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

export function searchSnippets(query: string): CodeSnippet[] {
  const rows = db
    .prepare(
      'SELECT * FROM code_snippets WHERE name LIKE ? OR code LIKE ? ORDER BY updated_at DESC'
    )
    .all(`%${query}%`, `%${query}%`) as CodeSnippetRow[];
  return rows.map(mapRowToSnippet);
}
