export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(data: string): void;
  onData(callback: (data: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  isConnected(): boolean;
}
