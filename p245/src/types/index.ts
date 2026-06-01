export type SimulatorState =
  | "idle"
  | "waiting_cts"
  | "transmitting"
  | "retransmitting"
  | "waiting_ack"
  | "complete"
  | "aborted";

export type TPMode = "bam" | "cmdt" | "multi_node_bam";

export interface ReceiverNodeConfig {
  node_id: number;
  name: string;
  address: number;
  packet_loss_rate: number;
  out_of_order_rate: number;
}

export interface SimulationConfig {
  mode: TPMode;
  messageSize: number;
  sourceAddress: number;
  destinationAddress: number;
  packetLossRate: number;
  frameInterval: number;
  outOfOrderRate: number;
  ctsWindowSize: number;
  ctsTimeout: number;
  ctsLossRate: number;
  maxRtsRetries: number;
  receiverNodes: ReceiverNodeConfig[];
}

export interface FrameEvent {
  timestamp: number;
  can_id?: number;
  pgn: number;
  sourceAddress: number;
  destinationAddress: number;
  sequenceNumber: number;
  data: number[];
  payload_data?: number[];
  totalPackets: number;
  isRetransmit: boolean;
  is_lost?: boolean;
  mode?: string;
}

export interface BamAnnounceEvent extends FrameEvent {
  message_size: number;
  total_packets: number;
  target_pgn: number;
}

export interface RTSEvent extends FrameEvent {
  message_size: number;
  total_packets: number;
  window_size: number;
  target_pgn: number;
}

export interface CTSEvent extends FrameEvent {
  packets_allowed: number;
  next_sequence: number;
  target_pgn: number;
  is_retry?: boolean;
}

export interface EomAckEvent extends FrameEvent {
  message_size: number;
  total_packets: number;
  target_pgn: number;
}

export interface ProgressEvent {
  timestamp: number;
  mode?: string;
  message_id: string;
  total_packets: number;
  received_packets: number;
  missing_sequences: number[];
  complete: boolean;
  reassembled_data?: number[];
}

export interface StateEvent {
  timestamp: number;
  from: SimulatorState;
  to: SimulatorState;
  details?: string;
  mode?: string;
}

export interface CompleteEvent {
  timestamp: number;
  mode?: string;
  total_packets: number;
  received_count: number;
  lost_count: number;
  lost_sequences: number[];
  reassembled_complete: boolean;
  original_message: number[];
  reassembled_message: number[];
}

export type WsEventPayload =
  | FrameEvent
  | BamAnnounceEvent
  | RTSEvent
  | CTSEvent
  | EomAckEvent
  | ProgressEvent
  | StateEvent
  | CompleteEvent;

export interface WsServerMessage {
  type:
    | "bam_announce"
    | "rts_sent"
    | "rts_retry"
    | "rts_timeout"
    | "cts_sent"
    | "frame_sent"
    | "frame_received"
    | "frame_lost"
    | "frame_retransmit"
    | "sequence_error"
    | "eom_ack"
    | "reassembly_progress"
    | "node_progress"
    | "node_receive"
    | "simulation_complete"
    | "state_change"
    | "config_updated"
    | "simulation_started"
    | "simulation_stopped"
    | "simulation_reset"
    | "error";
  payload: WsEventPayload;
}

export interface WsClientMessage {
  type: "start_simulation" | "stop_simulation" | "reset_simulation" | "update_config";
  payload?: SimulationConfig;
}

export interface FrameLogEntry {
  id: string;
  type: string;
  timestamp: number;
  data: WsEventPayload;
}

export const PGN_NAMES: Record<number, string> = {
  0xec00: "TP.CM (连接管理)",
  0xeb00: "TP.DT (数据传输)",
};

export const STATE_LABELS: Record<SimulatorState, string> = {
  idle: "空闲",
  waiting_cts: "等待CTS",
  transmitting: "传输中",
  retransmitting: "重传中",
  waiting_ack: "等待确认",
  complete: "已完成",
  aborted: "已中止",
};
