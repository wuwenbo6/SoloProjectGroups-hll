export interface TPKTHeader {
  version: number;
  reserved: number;
  length: number;
  offset: number;
  header_length: number;
  raw_bytes: string;
}

export interface COTPHeader {
  length: number;
  pdu_type: number;
  pdu_type_name: string;
  dst_ref: number;
  src_ref: number;
  class_option: number;
  offset: number;
  header_length: number;
  raw_bytes: string;
  params: Record<string, unknown>;
}

export interface S7CommHeader {
  protocol_id: number;
  msg_type: number;
  msg_type_name: string;
  reserved: number;
  pdu_ref: number;
  param_length: number;
  data_length: number;
  function_code: number;
  function_code_name: string;
  offset: number;
  header_length: number;
  raw_bytes: string;
}

export interface ReadItem {
  area: number;
  area_name: string;
  type: number;
  type_name: string;
  db_number: number;
  offset: number;
  bit_offset: number;
  length: number;
}

export interface WriteItem {
  area: number;
  area_name: string;
  type: number;
  type_name: string;
  db_number: number;
  offset: number;
  bit_offset: number;
  length: number;
  data_hex: string;
}

export interface S7CommParameters {
  setup_comm: Record<string, number> | null;
  read_items: ReadItem[];
  write_items: WriteItem[];
  raw_bytes: string;
}

export interface DataItem {
  index: number;
  return_code: number;
  return_code_name: string;
  transport_size: number;
  transport_size_name: string;
  data_length: number;
  data: string;
  data_values: number[];
}

export interface S7CommData {
  items: DataItem[];
  raw_bytes: string;
  error_code: number;
  error_name: string;
}

export interface ParseResult {
  tpkt: TPKTHeader | null;
  cotp: COTPHeader | null;
  s7comm: S7CommHeader | null;
  parameters: S7CommParameters | null;
  data: S7CommData | null;
  total_length: number;
  protocol_headers_length: number;
  iso_tsap_header_length: number;
  s7_header_length: number;
  raw_hex: string;
  error: string | null;
}

export interface HistoryRecord {
  id: number;
  timestamp: string;
  hex_data: string;
  parse_result: ParseResult;
  source: string;
}

export interface SamplePacket {
  name: string;
  hex: string;
  description: string;
}

export interface SimulationOperation {
  type: "read" | "write";
  timestamp: string;
  area: string;
  db_number: number;
  offset: number;
  data_type: string;
  count?: number;
  write_data?: number[];
  data?: number[];
  request_raw: string;
  request_parsed: ParseResult;
  response_raw: string;
  response_parsed: ParseResult;
}

export interface TimelineEvent {
  event: string;
  message?: string;
  raw?: string;
  parsed?: ParseResult;
  data?: number[];
  success?: boolean;
  timestamp: number;
}
