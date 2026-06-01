import { create } from 'zustand';
import type { Scene, ArtNetConfig, WebSocketMessage, MidiTimeCode } from '../../shared/types';
import { CHANNEL_COUNT } from '../../shared/types';

let sendMessageFn: ((msg: WebSocketMessage) => void) | null = null;

export function setSendMessage(fn: (msg: WebSocketMessage) => void) {
  sendMessageFn = fn;
}

function sendMessage(msg: WebSocketMessage) {
  if (sendMessageFn) {
    sendMessageFn(msg);
  }
}

interface ConsoleState {
  channels: number[];
  grandMaster: number;
  blackout: boolean;
  connected: boolean;
  artNetConfig: ArtNetConfig | null;
  scenes: Scene[];
  activeGroup: number;
  midiTimecode: MidiTimeCode | null;
  midiConnected: boolean;
  midiDeviceName: string | null;
  setChannels: (channels: number[]) => void;
  setChannel: (channel: number, value: number) => void;
  setGrandMaster: (value: number) => void;
  setBlackout: (active: boolean) => void;
  setConnected: (connected: boolean) => void;
  setArtNetConfig: (config: ArtNetConfig) => void;
  setScenes: (scenes: Scene[]) => void;
  setActiveGroup: (group: number) => void;
  setMidiTimecode: (timecode: MidiTimeCode | null) => void;
  setMidiConnected: (connected: boolean, deviceName?: string) => void;
  updateChannel: (channel: number, value: number) => void;
  updateGrandMaster: (value: number) => void;
  updateBlackout: (active: boolean) => void;
  loadScene: (scene: Scene) => void;
  resetAll: () => void;
  updateArtNetConfig: (config: Partial<ArtNetConfig>) => void;
}

const initialChannels = new Array(CHANNEL_COUNT).fill(0);

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  channels: initialChannels,
  grandMaster: 1,
  blackout: false,
  connected: false,
  artNetConfig: null,
  scenes: [],
  activeGroup: 0,
  midiTimecode: null,
  midiConnected: false,
  midiDeviceName: null,

  setChannels: (channels) => set({ channels }),

  setChannel: (channel, value) => {
    set((state) => {
      const newChannels = [...state.channels];
      newChannels[channel - 1] = Math.max(0, Math.min(255, Math.floor(value)));
      return { channels: newChannels };
    });
  },

  setGrandMaster: (value) => set({ grandMaster: Math.max(0, Math.min(1, value)) }),

  setBlackout: (active) => set({ blackout: active }),

  setConnected: (connected) => set({ connected }),

  setArtNetConfig: (config) => set({ artNetConfig: config }),

  setScenes: (scenes) => set({ scenes }),

  setActiveGroup: (group) => set({ activeGroup: group }),

  setMidiTimecode: (timecode) => set({ midiTimecode: timecode }),

  setMidiConnected: (connected, deviceName) =>
    set({ midiConnected: connected, midiDeviceName: deviceName || null }),

  updateChannel: (channel, value) => {
    get().setChannel(channel, value);
    sendMessage({
      type: 'channel-update',
      channels: [{ channel, value }],
    });
  },

  updateGrandMaster: (value) => {
    get().setGrandMaster(value);
    sendMessage({
      type: 'grand-master',
      value,
    });
  },

  updateBlackout: (active) => {
    get().setBlackout(active);
    sendMessage({
      type: 'blackout',
      active,
    });
  },

  loadScene: (scene) => {
    get().setChannels(scene.channels);
    sendMessage({
      type: 'full-frame',
      data: scene.channels,
    });
  },

  resetAll: () => {
    const zeros = new Array(CHANNEL_COUNT).fill(0);
    get().setChannels(zeros);
    sendMessage({
      type: 'full-frame',
      data: zeros,
    });
  },

  updateArtNetConfig: (config) => {
    const { artNetConfig } = get();
    if (artNetConfig) {
      const newConfig = { ...artNetConfig, ...config };
      get().setArtNetConfig(newConfig);
      sendMessage({
        type: 'artnet-config',
        ip: newConfig.targetIp,
        port: newConfig.targetPort,
        net: newConfig.net,
        switch_: newConfig.switch_,
        universe: newConfig.universe,
      });
    }
  },
}));

interface WebSocketState {
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (msg: WebSocketMessage) => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  ws: null,

  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        useConsoleStore.getState().setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'connection':
              useConsoleStore.getState().setConnected(data.status === 'connected');
              break;
            case 'full-frame':
              useConsoleStore.getState().setChannels(data.data);
              break;
            case 'channel-update':
              data.channels.forEach(({ channel, value }) => {
                useConsoleStore.getState().setChannel(channel, value);
              });
              break;
            case 'grand-master':
              useConsoleStore.getState().setGrandMaster(data.value);
              break;
            case 'blackout':
              useConsoleStore.getState().setBlackout(data.active);
              break;
            case 'artnet-config':
              useConsoleStore.getState().setArtNetConfig({
                targetIp: data.ip,
                targetPort: data.port,
                net: data.net,
                switch_: data.switch_,
                universe: data.universe,
              });
              break;
            case 'midi-timecode':
              useConsoleStore.getState().setMidiTimecode(data.timecode);
              break;
            case 'midi-status':
              useConsoleStore.getState().setMidiConnected(data.connected, data.deviceName);
              break;
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        useConsoleStore.getState().setConnected(false);
        useConsoleStore.getState().setMidiConnected(false);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      set({ ws });
      setSendMessage((msg) => {
        const currentWs = useWebSocketStore.getState().ws;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          currentWs.send(JSON.stringify(msg));
        }
      });
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  sendMessage: (msg) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  },
}));
