import type {
  ResumeToken,
  OpTime,
  Document,
  ChangeEvent,
  UpdateDescription,
  ResumeTokenError,
  MatchFilter,
  MatchCondition,
  ExportOptions,
  ExportFormat,
} from '../../shared/types.js';
import { Timestamp, ResumeTokenErrorCode } from '../../shared/types.js';

interface OplogEntry {
  optime: OpTime;
  term: number;
  event: ChangeEvent;
}

export class ChangeStreamsSimulator {
  private oplog: OplogEntry[] = [];
  private term: number = 1;
  private lastTimestamp: number = 0;
  private incrementCounter: number = 0;
  private maxOplogSize: number = 1000;
  private oplogTruncationCount: number = 0;

  private advanceOptime(): OpTime {
    const now = Math.floor(Date.now() / 1000);
    if (now > this.lastTimestamp) {
      this.lastTimestamp = now;
      this.incrementCounter = 1;
    } else {
      this.incrementCounter++;
    }
    return { ts: this.lastTimestamp, inc: this.incrementCounter };
  }

  private generateResumeToken(optime: OpTime, term: number): ResumeToken {
    const raw = `${term}:${optime.ts}:${optime.inc}`;
    const _data = Buffer.from(raw).toString('base64');
    return { _data, _term: term, _optime: { ...optime } };
  }

  public parseResumeToken(token: string): { term: number; optime: OpTime } | ResumeTokenError {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const parts = decoded.split(':');
      if (parts.length !== 3) {
        return {
          code: ResumeTokenErrorCode.INVALID_TOKEN,
          message: 'Invalid resume token format',
          detail: `Expected 3 parts, got ${parts.length}`,
        };
      }
      const term = parseInt(parts[0]);
      const ts = parseInt(parts[1]);
      const inc = parseInt(parts[2]);
      if (isNaN(term) || isNaN(ts) || isNaN(inc) || term < 0 || ts < 0 || inc < 0) {
        return {
          code: ResumeTokenErrorCode.INVALID_TOKEN,
          message: 'Invalid resume token values',
          detail: `term=${term}, ts=${ts}, inc=${inc}`,
        };
      }
      return { term, optime: { ts, inc } };
    } catch {
      return {
        code: ResumeTokenErrorCode.INVALID_TOKEN,
        message: 'Failed to decode resume token',
        detail: 'Token is not valid Base64',
      };
    }
  }

  private compareOptime(a: OpTime, b: OpTime): number {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.inc - b.inc;
  }

  public validateResumeToken(token: string): ResumeTokenError | null {
    const parsed = this.parseResumeToken(token);
    if ('code' in parsed) return parsed;

    const { term, optime } = parsed;

    if (term > this.term) {
      return {
        code: ResumeTokenErrorCode.FUTURE_TOKEN,
        message: 'Resume token references a future term',
        detail: `Token term ${term} is ahead of current term ${this.term}`,
        currentTerm: this.term,
      };
    }

    if (term < this.term) {
      return {
        code: ResumeTokenErrorCode.TERM_MISMATCH,
        message: 'Resume token belongs to an old term (server restart occurred)',
        detail: `Token term ${term} is behind current term ${this.term}. The server has restarted or a new term has begun.`,
        currentTerm: this.term,
      };
    }

    if (this.oplog.length === 0) {
      return null;
    }

    const oldestEntry = this.oplog[0];
    if (this.compareOptime(optime, oldestEntry.optime) < 0) {
      return {
        code: ResumeTokenErrorCode.TOKEN_EXPIRED,
        message: 'Resume token is too old (oplog has been truncated)',
        detail: `Token optime (${optime.ts}:${optime.inc}) is before oldest available (${oldestEntry.optime.ts}:${oldestEntry.optime.inc}). ${this.oplogTruncationCount} entries have been truncated.`,
        currentTerm: this.term,
        oldestOptime: oldestEntry.optime,
      };
    }

    return null;
  }

  public createEvent(
    operationType: 'insert' | 'update' | 'delete',
    doc: Document,
    updateDescription?: UpdateDescription
  ): ChangeEvent {
    const optime = this.advanceOptime();
    const token = this.generateResumeToken(optime, this.term);

    const event: ChangeEvent = {
      _id: token,
      operationType,
      clusterTime: new Timestamp(optime.ts, optime.inc),
      ns: { db: 'test', coll: 'simulation' },
      documentKey: { _id: doc._id },
      ...(operationType !== 'delete' && { fullDocument: doc }),
      ...(operationType === 'update' && updateDescription && { updateDescription }),
    };

    this.oplog.push({ optime, term: this.term, event });

    if (this.oplog.length > this.maxOplogSize) {
      const removed = this.oplog.splice(0, this.oplog.length - this.maxOplogSize);
      this.oplogTruncationCount += removed.length;
    }

    return event;
  }

  public getEventsAfter(resumeToken?: string): ChangeEvent[] | ResumeTokenError {
    if (!resumeToken) {
      return this.oplog.map((entry) => entry.event);
    }

    const validationError = this.validateResumeToken(resumeToken);
    if (validationError) return validationError;

    const parsed = this.parseResumeToken(resumeToken);
    if ('code' in parsed) return parsed;

    const { optime, term } = parsed;

    return this.oplog
      .filter((entry) => {
        if (entry.term !== term) return entry.term > term;
        return this.compareOptime(entry.optime, optime) > 0;
      })
      .map((entry) => entry.event);
  }

  public getLastToken(): string | null {
    if (this.oplog.length === 0) return null;
    const last = this.oplog[this.oplog.length - 1];
    return last.event._id._data;
  }

  public getAllEvents(): ChangeEvent[] {
    return this.oplog.map((entry) => entry.event);
  }

  public getEventCount(): number {
    return this.oplog.length;
  }

  public getTerm(): number {
    return this.term;
  }

  public getCurrentOptime(): OpTime | null {
    if (this.oplog.length === 0) return null;
    return { ...this.oplog[this.oplog.length - 1].optime };
  }

  public getOldestOptime(): OpTime | null {
    if (this.oplog.length === 0) return null;
    return { ...this.oplog[0].optime };
  }

  public getTruncationCount(): number {
    return this.oplogTruncationCount;
  }

  public advanceTerm(): number {
    this.term++;
    return this.term;
  }

  public clear(): void {
    this.oplog = [];
    this.lastTimestamp = 0;
    this.incrementCounter = 0;
    this.oplogTruncationCount = 0;
  }

  public setMaxOplogSize(size: number): void {
    this.maxOplogSize = Math.max(1, size);
    if (this.oplog.length > this.maxOplogSize) {
      const removed = this.oplog.splice(0, this.oplog.length - this.maxOplogSize);
      this.oplogTruncationCount += removed.length;
    }
  }

  private getFieldValue(doc: Document | null | undefined, field: string): any {
    if (!doc) return undefined;
    const parts = field.split('.');
    let value: any = doc;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    return value;
  }

  private matchCondition(doc: Document | null, condition: MatchCondition): boolean {
    const { field, operator, value } = condition;
    const fieldValue = this.getFieldValue(doc, field);

    switch (operator) {
      case '$eq':
        return fieldValue === value;
      case '$ne':
        return fieldValue !== value;
      case '$gt':
        return fieldValue !== undefined && fieldValue > value;
      case '$gte':
        return fieldValue !== undefined && fieldValue >= value;
      case '$lt':
        return fieldValue !== undefined && fieldValue < value;
      case '$lte':
        return fieldValue !== undefined && fieldValue <= value;
      case '$in':
        return Array.isArray(value) && value.includes(fieldValue);
      case '$nin':
        return Array.isArray(value) && !value.includes(fieldValue);
      case '$exists':
        return value ? fieldValue !== undefined : fieldValue === undefined;
      case '$regex':
        if (fieldValue === undefined || fieldValue === null) return false;
        try {
          const regex = new RegExp(value);
          return regex.test(String(fieldValue));
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  public matchEvent(event: ChangeEvent, filter: MatchFilter | null): boolean {
    if (!filter || !filter.enabled || filter.conditions.length === 0) {
      return true;
    }

    const doc = event.operationType === 'delete' ? null : event.fullDocument;
    const results = filter.conditions.map((cond) => this.matchCondition(doc, cond));

    return filter.logicalOp === '$and'
      ? results.every((r) => r)
      : results.some((r) => r);
  }

  public getFilteredEvents(filter: MatchFilter | null, resumeToken?: string): ChangeEvent[] | ResumeTokenError {
    const events = this.getEventsAfter(resumeToken);
    if ('code' in events) return events;
    return events.filter((event) => this.matchEvent(event, filter));
  }

  public exportEvents(options: ExportOptions): { data: string; count: number } | ResumeTokenError {
    const { format, resumeAfter, filter, operationTypes, startTime, endTime } = options;

    let events = this.getEventsAfter(resumeAfter);
    if ('code' in events) return events;

    if (filter) {
      events = events.filter((event) => this.matchEvent(event, filter));
    }

    if (operationTypes && operationTypes.length > 0) {
      events = events.filter((event) => operationTypes.includes(event.operationType));
    }

    if (startTime !== undefined) {
      events = events.filter((event) => event.clusterTime.low >= startTime);
    }

    if (endTime !== undefined) {
      events = events.filter((event) => event.clusterTime.low <= endTime);
    }

    let data: string;
    const count = events.length;

    switch (format) {
      case 'csv':
        data = this.convertToCSV(events);
        break;
      case 'ndjson':
        data = events.map((e) => JSON.stringify(e)).join('\n');
        break;
      case 'json':
      default:
        data = JSON.stringify(events, null, 2);
        break;
    }

    return { data, count };
  }

  private convertToCSV(events: ChangeEvent[]): string {
    if (events.length === 0) {
      return 'operationType,documentId,timestamp,term,ts,inc\n';
    }

    const header = 'operationType,documentId,timestamp,term,ts,inc';
    const rows = events.map((event) => {
      const term = event._id._term;
      const ts = event._id._optime.ts;
      const inc = event._id._optime.inc;
      const timestamp = new Date(ts * 1000).toISOString();
      return [
        event.operationType,
        event.documentKey._id,
        timestamp,
        term,
        ts,
        inc,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    return [header, ...rows].join('\n') + '\n';
  }
}

export const changeStreams = new ChangeStreamsSimulator();
