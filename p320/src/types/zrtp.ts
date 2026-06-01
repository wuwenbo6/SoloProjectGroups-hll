export type AlgorithmType = "DH2048" | "ECDH_P256";

export interface PartyResult {
  name: string;
  zid: string;
  dh_public_key: string;
  dh_shared_secret: string;
  s0: string;
  srtp_master_key: string;
  srtp_master_salt: string;
  sas: string;
  sas_verified: boolean;
  media_connection_established: boolean;
  is_encrypted: boolean;
}

export type MessageType =
  | "Hello"
  | "HelloACK"
  | "Commit"
  | "DHPart1"
  | "DHPart2"
  | "Confirm1"
  | "Confirm2"
  | "Error"
  | "SASRelay"
  | "GoClear"
  | "GoClearACK";

export interface ZRTPMessage {
  step: number;
  from: "alice" | "bob" | "mitm" | "system";
  to: "alice" | "bob" | "alice_bob" | "all";
  type: MessageType;
  description: string;
  timestamp: number;
  requires_confirmation?: boolean;
  data?: Record<string, unknown>;
}

export interface NegotiateResponse {
  session_id: string;
  alice: PartyResult;
  bob: PartyResult;
  sas: string;
  sas_match: boolean;
  algorithm: AlgorithmType;
  simulate_mitm: boolean;
  media_connection_established: boolean;
  is_encrypted: boolean;
  created_at: number;
  pending_goclear?: {
    sender: "alice" | "bob";
    reason: string;
    requires_confirmation: boolean;
  } | null;
  messages: ZRTPMessage[];
}

export type NegotiateStatus = "idle" | "negotiating" | "success" | "error";
