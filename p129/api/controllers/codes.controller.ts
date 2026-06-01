import type { Request, Response } from 'express';
import {
  getAllSnippets,
  getSnippetById,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  searchSnippets,
} from '../repositories/code.repository.js';

export function listSnippets(req: Request, res: Response) {
  try {
    const { q } = req.query;
    let snippets;

    if (q && typeof q === 'string' && q.trim()) {
      snippets = searchSnippets(q.trim());
    } else {
      snippets = getAllSnippets();
    }

    res.json({
      success: true,
      data: snippets,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to list snippets: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function getSnippet(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid snippet ID',
      });
      return;
    }

    const snippet = getSnippetById(id);

    if (!snippet) {
      res.status(404).json({
        success: false,
        error: 'Snippet not found',
      });
      return;
    }

    res.json({
      success: true,
      data: snippet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get snippet: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function createNewSnippet(req: Request, res: Response) {
  try {
    const { name, code } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        error: 'Name is required',
      });
      return;
    }

    if (!code || !code.trim()) {
      res.status(400).json({
        success: false,
        error: 'Code is required',
      });
      return;
    }

    const snippet = createSnippet(name.trim(), code);

    res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to create snippet: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function updateExistingSnippet(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, code } = req.body;

    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid snippet ID',
      });
      return;
    }

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        error: 'Name is required',
      });
      return;
    }

    if (!code || !code.trim()) {
      res.status(400).json({
        success: false,
        error: 'Code is required',
      });
      return;
    }

    const snippet = updateSnippet(id, name.trim(), code);

    if (!snippet) {
      res.status(404).json({
        success: false,
        error: 'Snippet not found',
      });
      return;
    }

    res.json({
      success: true,
      data: snippet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to update snippet: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function deleteExistingSnippet(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid snippet ID',
      });
      return;
    }

    const deleted = deleteSnippet(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Snippet not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Snippet deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to delete snippet: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
