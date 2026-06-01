import axios from 'axios';
import { DeviceStatus, ScpiCommandResponse, ConnectRequest, ScpiCommandRequest, EnqueueResponse, QueueStatus, QueuedCommand } from '../types';

const API_BASE = '/api';

export const api = {
  async healthCheck() {
    const res = await axios.get(`${API_BASE}/health`);
    return res.data;
  },

  async getDeviceStatus(): Promise<{ success: boolean; status: DeviceStatus }> {
    const res = await axios.get(`${API_BASE}/device/status`);
    return res.data;
  },

  async connectDevice(data: ConnectRequest): Promise<{ success: boolean; message: string; status: DeviceStatus }> {
    const res = await axios.post(`${API_BASE}/device/connect`, data);
    return res.data;
  },

  async disconnectDevice(): Promise<{ success: boolean; message: string; status: DeviceStatus }> {
    const res = await axios.post(`${API_BASE}/device/disconnect`);
    return res.data;
  },

  async sendCommand(data: ScpiCommandRequest): Promise<ScpiCommandResponse> {
    const res = await axios.post(`${API_BASE}/device/command`, data);
    return res.data;
  },

  async enqueueCommand(data: ScpiCommandRequest): Promise<EnqueueResponse> {
    const res = await axios.post(`${API_BASE}/queue/enqueue`, data);
    return res.data;
  },

  async getCommandStatus(id: string): Promise<{ success: boolean; command: QueuedCommand }> {
    const res = await axios.get(`${API_BASE}/queue/status/${id}`);
    return res.data;
  },

  async getQueueStatus(): Promise<{ success: boolean; queue: QueueStatus }> {
    const res = await axios.get(`${API_BASE}/queue`);
    return res.data;
  },

  async clearQueue(): Promise<{ success: boolean; message: string; queue: QueueStatus }> {
    const res = await axios.delete(`${API_BASE}/queue`);
    return res.data;
  },

  async parseWaveformData(data: string): Promise<{
    success: boolean;
    values: number[];
    stats: {
      count: number;
      min: number;
      max: number;
      mean: number;
      stdDev: number;
      peakToPeak: number;
    };
  }> {
    const res = await axios.post(`${API_BASE}/waveform/parse`, { data });
    return res.data;
  },

  async exportWaveformCsv(data: string, xIncrement = 1e-6, xOrigin = 0): Promise<void> {
    const res = await axios.post(`${API_BASE}/waveform/export-csv`, { data, xIncrement, xOrigin }, {
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `waveform_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
