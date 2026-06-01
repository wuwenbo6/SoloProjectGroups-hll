import { getDatabase } from '../db/database.js';
import type { Event } from '../../shared/types.js';

export function createEvent(
  recordingId: string,
  timestamp: number,
  type: Event['type'],
  title: string,
  description?: string
): Event {
  const db = getDatabase();
  
  return db.events.create({
    recordingId,
    timestamp,
    type,
    title,
    description,
  });
}

export function getEvents(recordingId?: string, type?: Event['type']): Event[] {
  const db = getDatabase();
  return db.events.getAll(recordingId, type).sort((a, b) => b.timestamp - a.timestamp);
}

export function getEventById(id: string): Event | null {
  const db = getDatabase();
  return db.events.getById(id) || null;
}

export function updateEvent(
  id: string,
  updates: {
    title?: string;
    description?: string;
    type?: Event['type'];
    timestamp?: number;
  }
): Event | null {
  const db = getDatabase();
  return db.events.update(id, updates);
}

export function deleteEvent(id: string): boolean {
  const db = getDatabase();
  return db.events.delete(id);
}
