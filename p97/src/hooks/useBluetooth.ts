import { useState, useCallback, useRef } from 'react';

export interface EEGData {
  timestamp: number;
  channelData: number[];
  samplingRate: number;
}

export interface DeviceInfo {
  name: string;
  id: string;
  connected: boolean;
  battery?: number;
  signalStrength?: number;
}

const MUSE_SERVICE = '0000fe8d-0000-1000-8000-00805f9b34fb';
const MUSE_CONTROL = '273e0001-4c4d-454d-96be-f03bac821358';
const MUSE_TP9 = '273e0003-4c4d-454d-96be-f03bac821358';
const MUSE_AF7 = '273e0004-4c4d-454d-96be-f03bac821358';
const MUSE_AF8 = '273e0005-4c4d-454d-96be-f03bac821358';
const MUSE_TP10 = '273e0006-4c4d-454d-96be-f03bac821358';

export function useBluetooth() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [eegData, setEegData] = useState<EEGData | null>(null);
  
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const channelDataRef = useRef<number[]>([0, 0, 0, 0]);

  const decodeEEG = useCallback((data: DataView): number[] => {
    const samples: number[] = [];
    for (let i = 0; i < 12; i++) {
      const index = i * 2 + 2;
      let value = (data.getUint8(index) << 8) | data.getUint8(index + 1);
      if (value >= 0x8000) value = value - 0x10000;
      samples.push(value * 0.000131);
    }
    return samples;
  }, []);

  const handleCharacteristicValueChanged = useCallback((channelIndex: number) => {
    return (event: Event) => {
      const target = event.target as unknown as { value?: DataView };
      if (!target.value) return;
      
      const samples = decodeEEG(target.value);
      const avgValue = samples.reduce((a, b) => a + b, 0) / samples.length;
      
      channelDataRef.current[channelIndex] = avgValue;
      
      setEegData({
        timestamp: Date.now(),
        channelData: [...channelDataRef.current],
        samplingRate: 256
      });
    };
  }, [decodeEEG]);

  const scanAndConnect = useCallback(async () => {
    if (!navigator.bluetooth) {
      alert('您的浏览器不支持Web Bluetooth API，请使用Chrome或Edge浏览器');
      return;
    }

    setIsScanning(true);
    
    try {
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Muse' },
          { services: [MUSE_SERVICE] }
        ],
        optionalServices: [MUSE_SERVICE, 'battery_service']
      });

      deviceRef.current = bluetoothDevice;
      
      setDevice({
        name: bluetoothDevice.name || 'Unknown Device',
        id: bluetoothDevice.id,
        connected: false
      });

      bluetoothDevice.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setDevice(prev => prev ? { ...prev, connected: false } : null);
      });

      const server = await bluetoothDevice.gatt?.connect();
      serverRef.current = server || null;
      
      if (!server) throw new Error('Failed to connect to GATT server');

      const service = await server.getPrimaryService(MUSE_SERVICE);
      
      const controlChar = await service.getCharacteristic(MUSE_CONTROL);
      await controlChar.writeValue(new TextEncoder().encode('s'));
      await controlChar.writeValue(new TextEncoder().encode('d'));

      const characteristics = [MUSE_TP9, MUSE_AF7, MUSE_AF8, MUSE_TP10];
      
      for (let i = 0; i < characteristics.length; i++) {
        const char = await service.getCharacteristic(characteristics[i]);
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged(i));
      }

      try {
        const batteryService = await server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        const batteryValue = await batteryChar.readValue();
        const battery = batteryValue.getUint8(0);
        
        setDevice(prev => prev ? { ...prev, battery, connected: true } : null);
      } catch {
        setDevice(prev => prev ? { ...prev, connected: true } : null);
      }

      setIsConnected(true);
      
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      alert('连接失败: ' + (error as Error).message);
    } finally {
      setIsScanning(false);
    }
  }, [handleCharacteristicValueChanged]);

  const disconnect = useCallback(async () => {
    if (serverRef.current) {
      serverRef.current.disconnect();
      serverRef.current = null;
    }
    deviceRef.current = null;
    setIsConnected(false);
    setDevice(null);
    setEegData(null);
  }, []);

  return {
    device,
    isScanning,
    isConnected,
    eegData,
    scanAndConnect,
    disconnect
  };
}
