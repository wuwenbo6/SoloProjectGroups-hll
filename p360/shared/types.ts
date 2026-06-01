export interface OpTime {
  ts: number;
  inc: number;
}

export interface ResumeToken {
  _data: string;
  _term: number;
  _optime: OpTime;
}

export interface Document {
  _id: string;
  [key: string]: any;
  _createdAt: number;
  _updatedAt: number;
}

export class Timestamp {
  constructor(
    public low: number,
    public high: number
  ) {}

  toString(): string {
    return `Timestamp(${this.low}, ${this.high})`;
  }
}

export interface UpdateDescription {
  updatedFields: Record<string, any>;
  removedFields: string[];
}

export interface ChangeEvent {
  _id: ResumeToken;
  operationType: 'insert' | 'update' | 'delete';
  clusterTime: Timestamp;
  ns: {
    db: string;
    coll: string;
  };
  documentKey: {
    _id: string;
  };
  fullDocument?: Document;
  updateDescription?: UpdateDescription;
}

export enum ResumeTokenErrorCode {
  INVALID_TOKEN = 40601,
  TOKEN_EXPIRED = 40602,
  TERM_MISMATCH = 40603,
  FUTURE_TOKEN = 40604,
}

export interface ResumeTokenError {
  code: ResumeTokenErrorCode;
  message: string;
  detail?: string;
  currentTerm?: number;
  oldestOptime?: OpTime;
}

export function isResumeTokenError(obj: any): obj is ResumeTokenError {
  return obj && typeof obj.code === 'number' && typeof obj.message === 'string';
}

export type MatchOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$in'
  | '$nin'
  | '$exists'
  | '$regex';

export interface MatchCondition {
  field: string;
  operator: MatchOperator;
  value: any;
}

export interface MatchFilter {
  id: string;
  name: string;
  enabled: boolean;
  conditions: MatchCondition[];
  logicalOp: '$and' | '$or';
}

export interface SetFilterMessage {
  type: 'setFilter';
  filter: MatchFilter | null;
}

export interface FilterUpdateMessage {
  type: 'filterUpdated';
  filter: MatchFilter | null;
  matchedCount: number;
}

export interface ConnectMessage {
  type: 'connect';
  resumeAfter?: string;
  filter?: MatchFilter | null;
}

export interface DisconnectMessage {
  type: 'disconnect';
}

export type ClientMessage = ConnectMessage | DisconnectMessage | SetFilterMessage;

export interface EventMessage {
  type: 'change';
  event: ChangeEvent;
  isResumed: boolean;
}

export interface ConnectedMessage {
  type: 'connected';
  startingToken?: string;
  missedEventCount?: number;
  error?: ResumeTokenError;
  currentTerm?: number;
  currentOptime?: OpTime;
}

export interface ResumeCompleteMessage {
  type: 'resumeComplete';
  totalResumed: number;
}

export interface TokenErrorMessage {
  type: 'tokenError';
  error: ResumeTokenError;
}

export type ServerMessage = EventMessage | ConnectedMessage | ResumeCompleteMessage | TokenErrorMessage | FilterUpdateMessage;

export type ExportFormat = 'json' | 'csv' | 'ndjson';

export interface ExportOptions {
  format: ExportFormat;
  resumeAfter?: string;
  filter?: MatchFilter | null;
  operationTypes?: Array<'insert' | 'update' | 'delete'>;
  startTime?: number;
  endTime?: number;
}

export interface ExportResponse {
  success: boolean;
  data?: string;
  filename?: string;
  count?: number;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  tokenError?: ResumeTokenError;
}

export interface InsertResponse {
  document: Document;
}

export interface UpdateResponse {
  document: Document;
}

export interface DeleteResponse {
  documentId: string;
}

export interface CollectionResponse {
  documents: Document[];
}

export interface EventsResponse {
  events: ChangeEvent[];
}
