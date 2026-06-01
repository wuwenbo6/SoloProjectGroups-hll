import type { Document, UpdateDescription } from '../../shared/types.js';
import { changeStreams } from './ChangeStreamsService.js';
import { randomUUID } from 'crypto';

export class InMemoryCollection {
  private documents: Map<string, Document> = new Map();
  private listeners: Set<(event: any) => void> = new Set();

  public insert(data: Record<string, any>): Document {
    const now = Date.now();
    const doc: Document = {
      _id: randomUUID(),
      ...data,
      _createdAt: now,
      _updatedAt: now,
    };
    this.documents.set(doc._id, doc);

    const event = changeStreams.createEvent('insert', doc);
    this.notifyListeners(event);

    return doc;
  }

  public update(id: string, data: Record<string, any>): Document | null {
    const existing = this.documents.get(id);
    if (!existing) return null;

    const updatedFields: Record<string, any> = {};
    const removedFields: string[] = [];

    Object.keys(data).forEach((key) => {
      if (data[key] === undefined || data[key] === null) {
        if (existing[key] !== undefined) {
          removedFields.push(key);
        }
      } else {
        updatedFields[key] = data[key];
      }
    });

    const updatedDoc: Document = {
      ...existing,
    };

    Object.keys(updatedFields).forEach((key) => {
      updatedDoc[key] = updatedFields[key];
    });
    removedFields.forEach((key) => {
      delete updatedDoc[key];
    });

    updatedDoc._updatedAt = Date.now();
    this.documents.set(id, updatedDoc);

    const updateDescription: UpdateDescription = {
      updatedFields,
      removedFields,
    };

    const event = changeStreams.createEvent('update', updatedDoc, updateDescription);
    this.notifyListeners(event);

    return updatedDoc;
  }

  public delete(id: string): boolean {
    const existing = this.documents.get(id);
    if (!existing) return false;

    this.documents.delete(id);

    const event = changeStreams.createEvent('delete', existing);
    this.notifyListeners(event);

    return true;
  }

  public findById(id: string): Document | null {
    return this.documents.get(id) || null;
  }

  public findAll(): Document[] {
    return Array.from(this.documents.values());
  }

  public count(): number {
    return this.documents.size;
  }

  public clear(): void {
    this.documents.clear();
    changeStreams.clear();
  }

  public subscribe(callback: (event: any) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(event: any): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        console.error('Listener error:', e);
      }
    });
  }
}

export const collection = new InMemoryCollection();
