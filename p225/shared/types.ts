export interface Scene {
  id: string;
  name: string;
  channels: number[];
  createdAt: string;
  triggerTime?: string;
}

export interface ArtNetConfig {
  targetIp: string;
  targetPort: number;
  net: number;
  switch_: number;
  universe: number;
}

export interface MidiTimeCode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  rate: '24' | '25' | '30' | '30drop';
  full: string;
}

export type WebSocketMessage =
  | { type: 'channel-update'; channels: { channel: number; value: number }[] }
  | { type: 'full-frame'; data: number[] }
  | { type: 'connection'; status: 'connected' | 'disconnected' }
  | { type: 'artnet-config'; ip: string; port: number; net: number; switch_: number; universe: number }
  | { type: 'grand-master'; value: number }
  | { type: 'blackout'; active: boolean }
  | { type: 'midi-timecode'; timecode: MidiTimeCode }
  | { type: 'midi-status'; connected: boolean; deviceName?: string };

export interface Fixture {
  id: string;
  name: string;
  type: 'par' | 'moving-head' | 'bar' | 'dimmer';
  startChannel: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  channelMap: {
    dimmer?: number;
    red?: number;
    green?: number;
    blue?: number;
    white?: number;
    amber?: number;
    pan?: number;
    tilt?: number;
    strobe?: number;
  };
}

export const CHANNEL_COUNT = 512;
export const DEFAULT_ARTNET_PORT = 6454;
export const DEFAULT_NET = 0;
export const DEFAULT_SWITCH = 0;
export const DEFAULT_UNIVERSE = 0;
export const DEFAULT_BROADCAST_IP = '255.255.255.255';
export const SEND_INTERVAL_MS = 50;
