import cron from 'node-cron';
import type { SnapshotSchedule } from '../types.js';
import { getSchedules, updateSchedule } from './scheduleStore.js';
import { createSnapshot, deleteSnapshot } from './snapshotService.js';
import { getImageDetail } from './imageService.js';

const activeTasks: Map<string, cron.ScheduledTask> = new Map();

function generateSnapshotName(prefix: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}${timestamp}`;
}

async function executeSchedule(schedule: SnapshotSchedule): Promise<void> {
  console.log(`[Schedule] Executing schedule: ${schedule.name} for ${schedule.pool}/${schedule.imageName}`);

  try {
    const snapshotName = generateSnapshotName(schedule.prefix);
    await createSnapshot(schedule.pool, schedule.imageName, snapshotName);

    if (schedule.retentionCount > 0) {
      const detail = await getImageDetail(schedule.pool, schedule.imageName);
      const sortedSnapshots = detail.snapshots
        .filter((s) => s.name.startsWith(schedule.prefix))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const toDelete = sortedSnapshots.slice(0, -schedule.retentionCount);
      for (const snap of toDelete) {
        try {
          await deleteSnapshot(schedule.pool, schedule.imageName, snap.name, snap.isProtected);
        } catch (e) {
          console.error(`[Schedule] Failed to delete old snapshot ${snap.name}:`, e);
        }
      }
    }

    updateSchedule(schedule.id, {
      lastRun: new Date().toISOString(),
      lastSnapshotName: snapshotName,
    });
  } catch (error) {
    console.error(`[Schedule] Error executing schedule ${schedule.name}:`, error);
  }
}

export function scheduleTask(schedule: SnapshotSchedule): void {
  try {
    if (activeTasks.has(schedule.id)) {
      activeTasks.get(schedule.id)?.stop();
      activeTasks.delete(schedule.id);
    }

    if (!schedule.enabled) return;

    const task = cron.schedule(
      schedule.cronExpression,
      () => executeSchedule(schedule),
      {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      }
    );

    activeTasks.set(schedule.id, task);
    console.log(`[Schedule] Scheduled: ${schedule.name} (${schedule.cronExpression})`);
  } catch (error) {
    console.error(`[Schedule] Failed to schedule ${schedule.name}:`, error);
  }
}

export function unscheduleTask(scheduleId: string): void {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
    console.log(`[Schedule] Unscheduled: ${scheduleId}`);
  }
}

export function initializeScheduler(): void {
  const schedules = getSchedules();
  schedules.forEach(scheduleTask);
  console.log(`[Schedule] Initialized ${schedules.length} schedule(s)`);
}

export function reloadAllSchedules(): void {
  activeTasks.forEach((task) => task.stop());
  activeTasks.clear();
  initializeScheduler();
}
