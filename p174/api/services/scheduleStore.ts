import type { SnapshotSchedule } from '../types.js';

let schedules: Map<string, SnapshotSchedule> = new Map();

export function getSchedules(): SnapshotSchedule[] {
  return Array.from(schedules.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getSchedule(id: string): SnapshotSchedule | undefined {
  return schedules.get(id);
}

export function createSchedule(schedule: Omit<SnapshotSchedule, 'id' | 'createdAt'>): SnapshotSchedule {
  const id = Math.random().toString(36).substring(2, 10);
  const newSchedule: SnapshotSchedule = {
    ...schedule,
    id,
    createdAt: new Date().toISOString(),
  };
  schedules.set(id, newSchedule);
  return newSchedule;
}

export function updateSchedule(id: string, updates: Partial<SnapshotSchedule>): SnapshotSchedule | undefined {
  const schedule = schedules.get(id);
  if (!schedule) return undefined;
  const updated = { ...schedule, ...updates };
  schedules.set(id, updated);
  return updated;
}

export function deleteSchedule(id: string): boolean {
  return schedules.delete(id);
}

export function getSchedulesByImage(pool: string, imageName: string): SnapshotSchedule[] {
  return getSchedules().filter((s) => s.pool === pool && s.imageName === imageName);
}
