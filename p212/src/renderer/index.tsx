import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

declare global {
  interface Window {
    bacnetAPI: {
      listPorts: () => Promise<string[]>;
      connect: (port: string, baudRate: number) => Promise<{ success: boolean; error?: string }>;
      disconnect: () => Promise<{ success: boolean }>;
      isConnected: () => Promise<boolean>;
      clearFrames: () => Promise<{ success: boolean }>;
      getFrames: () => Promise<any[]>;
      getDevices: () => Promise<any[]>;
      sendWhoIs: (lowLimit?: number, highLimit?: number) => Promise<{ success: boolean; error?: string }>;
      setSourceAddress: (addr: number) => Promise<{ success: boolean }>;
      exportPcap: () => Promise<{ success: boolean; error?: string; path?: string }>;
      onFrame: (callback: (frame: any) => void) => void;
      onDeviceUpdate: (callback: (devices: any[]) => void) => void;
      onError: (callback: (error: string) => void) => void;
      removeFrameListener: () => void;
      removeDeviceListener: () => void;
      removeErrorListener: () => void;
    };
  }
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
