export interface ParseResult {
  id: number
  timestamp: string
  ssrc: number
  loss_rate: number
  discard_rate: number
  jitter_buffer_delay: number
  mos_cq: number
  mos_lq: number
  r_factor: number
  mos_p564: number
  codec: string
  report_blocks?: ReportBlock[]
  mos_p564_detail?: P564Detail
}

export interface P564Detail {
  mos: number
  loss_component: number
  jitter_penalty: number
  codec: string
  base_mos: number
  loss_rate: number
  jitter_delay: number
  comparisons?: Record<string, number>
}

export interface ReportBlock {
  block_type: number
  block_type_name: string
  fields: Record<string, number | string | number[] | null>
}

export interface TrendData {
  timestamps: string[]
  loss_rates: number[]
  jitter_delays: number[]
  mos_scores: number[]
  mos_p564_scores: number[]
}

export interface HistoryResponse {
  total: number
  page: number
  page_size: number
  records: ParseResult[]
}

export interface CodecInfo {
  description: string
  packetization_ms: number
  base_mos: number
}

export interface CodecListResponse {
  codecs: string[]
  params: Record<string, CodecInfo>
}

export interface CallInfo {
  ssrc: number
  ssrc_hex: string
  first_seen: string
  last_seen: string
  record_count: number
}

export interface CallSummary {
  ssrc: number | null
  ssrc_hex: string | null
  hours: number
  avg_loss_rate: number
  max_loss_rate: number
  min_loss_rate: number
  avg_jitter: number
  max_jitter: number
  avg_mos_cq: number
  min_mos_cq: number
  avg_mos_p564: number
  avg_r_factor: number
  min_r_factor: number
  record_count: number
  period_start: string
  period_end: string
}

export interface CallListResponse {
  calls: CallInfo[]
}

export interface CallTrendData {
  ssrc: number
  ssrc_hex: string
  timestamps: string[]
  loss_rates: number[]
  jitter_delays: number[]
  mos_scores: number[]
  mos_p564_scores: number[]
  codec: string | null
}
