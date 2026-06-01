import { Router, type Request, type Response } from 'express';
import {
  getLogEntries,
  getLogById,
  searchLogs,
  getLogStats,
  exportLogs,
  clearLogs,
  deleteLogEntry,
} from '../services/signLogService';
import type { SignLogEntry } from '../types';

const router = Router();

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getLogStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const entries = getLogEntries(limit, offset);
    
    res.json({
      success: true,
      data: {
        entries,
        total: entries.length,
        hasMore: entries.length === limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/search', (req: Request, res: Response) => {
  try {
    const filters = {
      operation: req.query.operation as string | undefined,
      status: req.query.status as string | undefined,
      firmwareName: req.query.firmwareName as string | undefined,
      certificateCN: req.query.certificateCN as string | undefined,
      startDate: req.query.startDate ? parseInt(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? parseInt(req.query.endDate as string) : undefined,
    };
    
    const entries = searchLogs(filters);
    
    res.json({
      success: true,
      data: {
        entries,
        total: entries.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const entry = getLogById(req.params.id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Log entry not found',
      });
    }
    
    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/export/:format', (req: Request, res: Response) => {
  try {
    const format = req.params.format as 'json' | 'csv' | 'txt';
    
    if (!['json', 'csv', 'txt'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Must be json, csv, or txt',
      });
    }
    
    const content = exportLogs(format);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sign_logs_${timestamp}.${format}`;
    
    let contentType = 'application/json';
    if (format === 'csv') contentType = 'text/csv';
    if (format === 'txt') contentType = 'text/plain';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/export', (req: Request, res: Response) => {
  try {
    const format = req.body.format as 'json' | 'csv' | 'txt';
    const entries = req.body.entries as SignLogEntry[] | undefined;
    
    if (!['json', 'csv', 'txt'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Must be json, csv, or txt',
      });
    }
    
    const content = exportLogs(format, entries);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sign_logs_${timestamp}.${format}`;
    
    let contentType = 'application/json';
    if (format === 'csv') contentType = 'text/csv';
    if (format === 'txt') contentType = 'text/plain';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteLogEntry(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Log entry not found',
      });
    }
    
    res.json({
      success: true,
      message: 'Log entry deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.delete('/', (_req: Request, res: Response) => {
  try {
    clearLogs();
    res.json({
      success: true,
      message: 'All logs cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
