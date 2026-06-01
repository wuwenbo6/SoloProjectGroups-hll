import { api } from './api';
import type { Plugin, Category, PluginFilter, PaginatedData, Rating, PluginVersion } from '../types';
import type { DependencyNode } from '../components/DependencyTree';

export const pluginService = {
  getPlugins(filter: PluginFilter = {}) {
    return api.get<PaginatedData<Plugin>>('/plugins', filter);
  },

  getPlugin(id: string) {
    return api.get<Plugin>(`/plugins/${id}`);
  },

  getPluginVersions(id: string) {
    return api.get<PluginVersion[]>(`/plugins/${id}/versions`);
  },

  getPluginRatings(id: string, page = 1, pageSize = 20) {
    return api.get<PaginatedData<Rating>>(`/plugins/${id}/ratings`, { page, pageSize });
  },

  getUserRating(id: string) {
    return api.get<Rating>(`/plugins/${id}/my-rating`);
  },

  ratePlugin(id: string, score: number, comment?: string) {
    return api.post<Rating>(`/plugins/${id}/rate`, { score, comment });
  },

  getCategories() {
    return api.get<Category[]>('/plugins/categories');
  },

  downloadPlugin(id: string, version?: string) {
    const params = version ? { version } : undefined;
    return api.download(`/plugins/${id}/download${params ? `?version=${version}` : ''}`);
  },

  deletePlugin(id: string) {
    return api.delete(`/plugins/${id}`);
  },

  uploadPlugin(formData: FormData, onProgress?: (progress: number) => void) {
    return api.upload<{ plugin: Plugin; parsed: any }>('/upload', formData, onProgress);
  },

  validatePlugin(formData: FormData) {
    return api.upload<{ valid: boolean; metadata?: any; error?: string }>('/upload/validate', formData);
  },

  getDependencyTree(pluginId: string) {
    return api.get<DependencyNode>(`/dependencies/${pluginId}/tree`);
  },

  checkCircularDependencies(pluginId: string) {
    return api.get<{ hasCircular: boolean; cycles: string[][] }>(`/dependencies/${pluginId}/check-circular`);
  },
};

export const authService = {
  login(email: string, password: string) {
    return api.post<{ user: any; token: string }>('/auth/login', { email, password });
  },

  register(email: string, password: string, name: string) {
    return api.post<{ user: any; token: string }>('/auth/register', { email, password, name });
  },

  getMe() {
    return api.get<any>('/auth/me');
  },
};

export const qgisService = {
  getServers() {
    return api.get<any[]>('/qgis/servers');
  },

  addServer(data: { name: string; url: string; apiKey: string; description?: string }) {
    return api.post<any>('/qgis/servers', data);
  },

  updateServer(id: string, data: { name?: string; url?: string; apiKey?: string; enabled?: boolean }) {
    return api.put<any>(`/qgis/servers/${id}`, data);
  },

  deleteServer(id: string) {
    return api.delete(`/qgis/servers/${id}`);
  },

  checkServerStatus(id: string) {
    return api.get<{ status: string; isOnline: boolean }>(`/qgis/servers/${id}/status`);
  },

  previewPlugin(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<any>('/upload/preview', formData);
  },

  uploadPlugin(file: File, category: string, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    return api.upload<any>('/upload', formData, onProgress);
  },

  getInstalledPlugins(serverId: string) {
    return api.get<any>(`/qgis/${serverId}/plugins`);
  },

  installPlugin(serverId: string, pluginId: string, version: string) {
    return api.post<any>(`/qgis/${serverId}/install/${pluginId}`, { version });
  },

  activatePlugin(serverId: string, pluginId: string) {
    return api.post<any>(`/qgis/${serverId}/activate/${pluginId}`);
  },

  uninstallPlugin(serverId: string, pluginId: string) {
    return api.post<any>(`/qgis/${serverId}/uninstall/${pluginId}`);
  },
};

export const developmentService = {
  getDrafts() {
    return api.get<any[]>('/development/drafts');
  },

  createDraft(metadata: any) {
    return api.post<any>('/development/drafts', { metadata });
  },

  updateDraft(id: string, metadata: any) {
    return api.put<any>(`/development/drafts/${id}`, { metadata });
  },

  publishDraft(id: string) {
    return api.post<any>(`/development/drafts/${id}/publish`);
  },

  rollbackVersion(pluginId: string, versionId: string) {
    return api.post<any>(`/development/${pluginId}/rollback/${versionId}`);
  },

  exportDependencyGraph(pluginId: string, format: 'json' | 'dot' | 'mermaid' = 'json') {
    return api.download(`/development/${pluginId}/dependencies/export?format=${format}`);
  },

  previewDependencyGraph(pluginId: string, format: 'json' | 'dot' | 'mermaid' = 'mermaid') {
    return api.get<any>(`/development/${pluginId}/dependencies/preview?format=${format}`);
  },
};
