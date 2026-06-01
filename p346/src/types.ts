export interface TacacsHeaderInfo {
  version: number;
  type: number;
  seqNo: number;
  flags: number;
  sessionId: number;
  length: number;
}

export interface PacketDetail {
  header: TacacsHeaderInfo;
  rawHex: string;
  decryptedHex?: string;
  fields: Record<string, any>;
}

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  sessionId: number;
  request: PacketDetail;
  response: PacketDetail;
}

export interface AuthorizeRequest {
  username: string;
  command: string;
  cmdArgs?: string[];
  attrs?: Record<string, string>;
  sessionId: number;
}

export interface AuthorizeResponse {
  allowed: boolean;
  reason: string;
  matchedPolicy?: string;
  returnAttrs?: Record<string, string>;
  request: PacketDetail;
  response: PacketDetail;
}

export interface AccountingRequest {
  username: string;
  sessionId: number;
  seqNo?: number;
  command?: string;
  status: string;
  args?: Record<string, string>;
}

export interface AccountingResponse {
  success: boolean;
  message: string;
  seqNo?: number;
  request: PacketDetail;
  response: PacketDetail;
}

export interface User {
  id: string;
  username: string;
  password: string;
  privilegeLevel: number;
  createdAt: string;
}

export interface AuthPolicy {
  id: string;
  username: string;
  commandPattern: string;
  argPatterns?: string[];
  allowed: boolean;
  priority: number;
  returnAttrs?: Record<string, string>;
  createdAt: string;
}

export interface SystemConfig {
  sharedSecret: string;
  users: User[];
  policies: AuthPolicy[];
}

export interface PacketRecord {
  id: string;
  sessionId: number;
  type: string;
  direction: string;
  rawHex: string;
  decryptedBody: string;
  headerFields: Record<string, any>;
  bodyFields: Record<string, any>;
  timestamp: string;
}

export interface TacacsSession {
  id: string;
  sessionId: number;
  username: string;
  status: string;
  startTime: string;
  endTime?: string;
}
