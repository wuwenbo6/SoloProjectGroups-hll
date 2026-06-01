interface ElectronAPI {
  onMessage: (callback: (message: any) => void) => void;
  onNegotiationUpdate: (callback: (state: any) => void) => void;
  onPowerCurvePoint: (callback: (point: any) => void) => void;
  onDeviceStatus: (callback: (status: any) => void) => void;
  onMessageIdGap: (callback: (event: any) => void) => void;
  onHardReset: (callback: (event: any) => void) => void;
  startSimulation: (scenario: string, speed: number) => void;
  stopSimulation: () => void;
  removeAllListeners: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
