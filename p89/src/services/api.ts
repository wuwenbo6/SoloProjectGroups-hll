import axios from 'axios';
import type {
  VirtualMachine,
  ClusterNode,
  Snapshot,
  OperationLog,
  CreateVMParams,
  MigrateParams,
  NodeStatus,
} from '../../shared/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const nodeApi = {
  getNodes: (): Promise<{ success: boolean; data: ClusterNode[] }> =>
    api.get('/nodes').then(res => res.data),
  getNodeStatus: (node: string): Promise<{ success: boolean; data: NodeStatus }> =>
    api.get(`/nodes/${node}/status`).then(res => res.data),
};

export const vmApi = {
  getVMs: (): Promise<{ success: boolean; data: VirtualMachine[] }> =>
    api.get('/vms').then(res => res.data),
  getVM: (node: string, id: number): Promise<{ success: boolean; data: VirtualMachine }> =>
    api.get(`/vms/${node}/${id}`).then(res => res.data),
  createVM: (params: CreateVMParams): Promise<{ success: boolean }> =>
    api.post('/vms', params).then(res => res.data),
  startVM: (node: string, id: number): Promise<{ success: boolean }> =>
    api.post(`/vms/${node}/${id}/start`).then(res => res.data),
  stopVM: (node: string, id: number): Promise<{ success: boolean }> =>
    api.post(`/vms/${node}/${id}/stop`).then(res => res.data),
  restartVM: (node: string, id: number): Promise<{ success: boolean }> =>
    api.post(`/vms/${node}/${id}/restart`).then(res => res.data),
  getSnapshots: (node: string, id: number): Promise<{ success: boolean; data: Snapshot[] }> =>
    api.get(`/vms/${node}/${id}/snapshots`).then(res => res.data),
  createSnapshot: (node: string, id: number, snapname: string, description: string): Promise<{ success: boolean }> =>
    api.post(`/vms/${node}/${id}/snapshots`, { snapname, description }).then(res => res.data),
  rollbackSnapshot: (node: string, id: number, snapname: string, preserveNetwork: boolean = true): Promise<{ success: boolean; message?: string }> =>
    api.post(`/vms/${node}/${id}/snapshots/${snapname}/rollback`, { preserveNetwork }).then(res => res.data),
  deleteSnapshot: (node: string, id: number, snapname: string): Promise<{ success: boolean }> =>
    api.delete(`/vms/${node}/${id}/snapshots/${snapname}`).then(res => res.data),
  migrateVM: (node: string, id: number, params: MigrateParams): Promise<{ success: boolean }> =>
    api.post(`/vms/${node}/${id}/migrate`, params).then(res => res.data),
};

export const logApi = {
  getLogs: (limit: number = 50, offset: number = 0): Promise<{ success: boolean; data: OperationLog[]; total: number }> =>
    api.get(`/logs?limit=${limit}&offset=${offset}`).then(res => res.data),
};

export const templateApi = {
  getTemplates: (): Promise<{ success: boolean; data: VirtualMachine[] }> =>
    api.get('/templates').then(res => res.data),
  cloneVM: (node: string, id: number, params: any): Promise<{ success: boolean }> =>
    api.post(`/templates/${node}/${id}/clone`, params).then(res => res.data),
  convertToTemplate: (node: string, id: number): Promise<{ success: boolean }> =>
    api.post(`/templates/${node}/${id}/template`).then(res => res.data),
};

export const autoScalerApi = {
  getConfig: (): Promise<{ success: boolean; data: any }> =>
    api.get('/autoscaler/config').then(res => res.data),
  updateConfig: (config: any): Promise<{ success: boolean; data: any }> =>
    api.put('/autoscaler/config', config).then(res => res.data),
  getHistory: (): Promise<{ success: boolean; data: any[] }> =>
    api.get('/autoscaler/history').then(res => res.data),
  start: (): Promise<{ success: boolean; message: string }> =>
    api.post('/autoscaler/start').then(res => res.data),
  stop: (): Promise<{ success: boolean; message: string }> =>
    api.post('/autoscaler/stop').then(res => res.data),
};

export const exportApi = {
  exportLogsCSV: () => window.open('/api/export/logs/csv', '_blank'),
  exportLogsJSON: () => window.open('/api/export/logs/json', '_blank'),
};
