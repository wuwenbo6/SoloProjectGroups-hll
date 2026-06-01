import type { Request, Response } from 'express';
import { 
  createEvent, 
  getEvents, 
  getEventById, 
  updateEvent, 
  deleteEvent 
} from '../services/eventService.js';

export async function createEventHandler(req: Request, res: Response) {
  try {
    const { recordingId, timestamp, type, title, description } = req.body;
    
    if (!recordingId || !timestamp || !type || !title) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const event = createEvent(recordingId, timestamp, type, title, description);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
}

export async function getEventsHandler(req: Request, res: Response) {
  try {
    const { recordingId, type } = req.query;
    const events = getEvents(recordingId as string, type as any);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get events' });
  }
}

export async function getEventHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const event = getEventById(id);
    
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get event' });
  }
}

export async function updateEventHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, description, type, timestamp } = req.body;
    
    const event = updateEvent(id, { title, description, type, timestamp });
    
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
}

export async function deleteEventHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const success = deleteEvent(id);
    
    if (!success) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
}
