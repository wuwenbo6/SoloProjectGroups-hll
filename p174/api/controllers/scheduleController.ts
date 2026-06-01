import { Request, Response } from 'express';
import {
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../services/scheduleStore.js';
import {
  scheduleTask,
  unscheduleTask,
  reloadAllSchedules,
} from '../services/scheduler.js';
import type { CreateScheduleRequest, ApiResponse } from '../types.js';

export async function handleListSchedules(req: Request, res: Response): Promise<void> {
  try {
    const schedules = getSchedules();
    res.status(200).json({ success: true, data: schedules } as ApiResponse<typeof schedules>);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleGetSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const schedule = getSchedule(id);
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }
    res.status(200).json({ success: true, data: schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleCreateSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { name, pool, imageName, cronExpression, prefix, retentionCount, enabled } =
      req.body as CreateScheduleRequest;

    if (!name || !pool || !imageName || !cronExpression || !prefix) {
      res.status(400).json({
        success: false,
        error: 'name, pool, imageName, cronExpression, and prefix are required',
      });
      return;
    }

    const schedule = createSchedule({
      name,
      pool,
      imageName,
      cronExpression,
      prefix,
      retentionCount: retentionCount || 0,
      enabled: enabled !== undefined ? enabled : true,
    });

    scheduleTask(schedule);

    res.status(201).json({ success: true, data: schedule, message: 'Schedule created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleUpdateSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updates = req.body;

    const schedule = updateSchedule(id, updates);
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }

    scheduleTask(schedule);

    res.status(200).json({ success: true, data: schedule, message: 'Schedule updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleDeleteSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    unscheduleTask(id);
    const deleted = deleteSchedule(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Schedule deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleToggleSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const schedule = getSchedule(id);
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }

    const updated = updateSchedule(id, { enabled });
    if (updated) {
      if (enabled) {
        scheduleTask(updated);
      } else {
        unscheduleTask(id);
      }
    }

    res.status(200).json({ success: true, data: updated, message: 'Schedule toggled' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleReloadSchedules(req: Request, res: Response): Promise<void> {
  try {
    reloadAllSchedules();
    res.status(200).json({ success: true, message: 'All schedules reloaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
