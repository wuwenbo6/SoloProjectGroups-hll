import type { Request, Response } from 'express';
import {
  getMotionConfig,
  updateMotionConfig,
  getMotionStatus,
  getMotionEvents,
  toggleRegion,
  addRegion,
  removeRegion,
  smartSearch,
} from '../services/motionDetectionService.js';

export async function getMotionConfigHandler(req: Request, res: Response) {
  try {
    const config = getMotionConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get motion config' });
  }
}

export async function updateMotionConfigHandler(req: Request, res: Response) {
  try {
    const updates = req.body;
    const config = updateMotionConfig(updates);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update motion config' });
  }
}

export async function getMotionStatusHandler(req: Request, res: Response) {
  try {
    const status = getMotionStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get motion status' });
  }
}

export async function getMotionEventsHandler(req: Request, res: Response) {
  try {
    const { recordingId } = req.query;
    const events = getMotionEvents(recordingId as string);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get motion events' });
  }
}

export async function toggleRegionHandler(req: Request, res: Response) {
  try {
    const { regionId } = req.params;
    const { enabled } = req.body;
    const region = toggleRegion(regionId, enabled);
    
    if (!region) {
      res.status(404).json({ error: 'Region not found' });
      return;
    }
    
    res.json(region);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle region' });
  }
}

export async function addRegionHandler(req: Request, res: Response) {
  try {
    const regionData = req.body;
    const region = addRegion(regionData);
    res.status(201).json(region);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add region' });
  }
}

export async function removeRegionHandler(req: Request, res: Response) {
  try {
    const { regionId } = req.params;
    const success = removeRegion(regionId);
    
    if (!success) {
      res.status(404).json({ error: 'Region not found' });
      return;
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove region' });
  }
}

export async function smartSearchHandler(req: Request, res: Response) {
  try {
    const params = {
      recordingId: req.query.recordingId as string,
      eventType: req.query.eventType as any,
      startTime: req.query.startTime ? parseInt(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime as string) : undefined,
      minIntensity: req.query.minIntensity ? parseInt(req.query.minIntensity as string) : undefined,
      regionId: req.query.regionId as string,
      query: req.query.query as string,
    };
    
    const result = smartSearch(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform smart search' });
  }
}
