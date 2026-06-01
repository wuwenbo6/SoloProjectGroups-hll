export interface FieldEntry {
  name: string;
  value: string;
  bits: number;
  hex: string;
}

export interface ProtocolLayer {
  name: string;
  fields: FieldEntry[];
  raw_hex: string;
  offset: number;
}

export interface NshConfig {
  ver: number;
  oam: number;
  md_type: number;
  next_protocol: number;
  spi: number;
  si: number;
  context_platform?: number;
  context_shared?: number;
  context_service_index?: number;
  context_reserved?: number;
}

export interface EncapsulateRequest {
  eth: {
    dst: string;
    src: string;
    type: number;
  };
  payload: string;
  outer_ip: {
    src: string;
    dst: string;
  };
  vni: number;
  next_protocol: number;
  udp_src_port?: number;
  udp_dst_port?: number;
  nsh?: NshConfig;
}

export interface EncapsulateResponse {
  layers: ProtocolLayer[];
  raw_hex: string;
}

export interface DecapsulateRequest {
  raw_hex: string;
}

export interface DecapsulateResponse {
  layers: ProtocolLayer[];
  inner_ethernet?: {
    dst: string;
    src: string;
    type: string;
    payload: string;
  };
  nsh?: NshConfig;
}

export interface Preset {
  name: string;
  description: string;
  encapsulate_request: EncapsulateRequest;
}

export const NEXT_PROTOCOL_OPTIONS = [
  { value: 0, label: "自动推断 (根据 EtherType)" },
  { value: 1, label: "IPv4 (1)" },
  { value: 2, label: "IPv6 (2)" },
  { value: 3, label: "Ethernet (3)" },
  { value: 4, label: "NSH (4)" },
];

export const NSH_NEXT_PROTOCOL_OPTIONS = [
  { value: 1, label: "IPv4 (1)" },
  { value: 2, label: "IPv6 (2)" },
  { value: 3, label: "Ethernet (3)" },
];

export const NSH_MD_TYPE_OPTIONS = [
  { value: 1, label: "Fixed Length (12-byte Context)" },
  { value: 2, label: "Variable Length (TLV)" },
];

export const LAYER_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  Ethernet: { bg: "bg-blue-950/60", border: "border-blue-500/40", text: "text-blue-400", glow: "shadow-blue-500/20" },
  IP: { bg: "bg-emerald-950/60", border: "border-emerald-500/40", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
  UDP: { bg: "bg-amber-950/60", border: "border-amber-500/40", text: "text-amber-400", glow: "shadow-amber-500/20" },
  VXLAN_GPE: { bg: "bg-purple-950/60", border: "border-purple-500/40", text: "text-purple-400", glow: "shadow-purple-500/20" },
  NSH: { bg: "bg-orange-950/60", border: "border-orange-500/40", text: "text-orange-400", glow: "shadow-orange-500/20" },
  NSH_Context_Header: { bg: "bg-orange-950/40", border: "border-orange-400/30", text: "text-orange-300", glow: "shadow-orange-500/20" },
  Inner_Ethernet: { bg: "bg-cyan-950/60", border: "border-cyan-500/40", text: "text-cyan-400", glow: "shadow-cyan-500/20" },
  Payload: { bg: "bg-rose-950/60", border: "border-rose-500/40", text: "text-rose-400", glow: "shadow-rose-500/20" },
};

const API_BASE = "http://localhost:5100/api";

export async function encapsulate(req: EncapsulateRequest): Promise<EncapsulateResponse> {
  const res = await fetch(`${API_BASE}/encapsulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Encapsulation failed");
  }
  return res.json();
}

export async function decapsulate(req: DecapsulateRequest): Promise<DecapsulateResponse> {
  const res = await fetch(`${API_BASE}/decapsulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Decapsulation failed");
  }
  return res.json();
}

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch(`${API_BASE}/presets`);
  return res.json();
}

export function exportPcapUrl(): string {
  return `${API_BASE}/export_pcap`;
}
