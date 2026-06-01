import { Request, Response } from 'express';
import { logService } from '../services/log.service.js';

export const exportLogsCSV = async (req: Request, res: Response) => {
  try {
    const logs = await logService.getAllLogs();
    const csv = logService.exportToCSV(logs);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
    
    res.send('\uFEFF' + csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to export CSV' });
  }
};

export const exportLogsJSON = async (req: Request, res: Response) => {
  try {
    const logs = await logService.getAllLogs();
    const json = logService.exportToJSON(logs);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.json"`);
    res.setHeader('Content-Length', Buffer.byteLength(json, 'utf8'));
    
    res.send(json);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to export JSON' });
  }
};
