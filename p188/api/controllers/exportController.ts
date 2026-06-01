import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import {
  createExportTask,
  getExportTask,
  getAllExportTasks,
  getExportFilePath,
  deleteExportTask,
} from '../services/exportService.js';

export async function createExportHandler(req: Request, res: Response) {
  try {
    const { recordingId } = req.params;
    const options = req.body;
    
    if (!recordingId) {
      res.status(400).json({ error: 'recordingId is required' });
      return;
    }
    
    const task = createExportTask(recordingId, {
      format: options.format || 'avi',
      startTime: options.startTime,
      endTime: options.endTime,
      includeAudio: options.includeAudio !== false,
      quality: options.quality || 'medium',
    });
    
    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create export task' });
  }
}

export async function getExportTaskHandler(req: Request, res: Response) {
  try {
    const { taskId } = req.params;
    const task = getExportTask(taskId);
    
    if (!task) {
      res.status(404).json({ error: 'Export task not found' });
      return;
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get export task' });
  }
}

export async function getAllExportsHandler(req: Request, res: Response) {
  try {
    const { recordingId } = req.query;
    const tasks = getAllExportTasks(recordingId as string);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get export tasks' });
  }
}

export async function downloadExportHandler(req: Request, res: Response) {
  try {
    const { taskId } = req.params;
    const filePath = getExportFilePath(taskId);
    
    if (!filePath) {
      res.status(404).json({ error: 'Export file not found or not completed' });
      return;
    }
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Export file not found on disk' });
      return;
    }
    
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const format = fileName.endsWith('.avi') ? 'video/x-msvideo' : 'video/mp4';
    
    res.writeHead(200, {
      'Content-Type': format,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download export' });
  }
}

export async function deleteExportHandler(req: Request, res: Response) {
  try {
    const { taskId } = req.params;
    const success = deleteExportTask(taskId);
    
    if (!success) {
      res.status(404).json({ error: 'Export task not found' });
      return;
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete export task' });
  }
}
