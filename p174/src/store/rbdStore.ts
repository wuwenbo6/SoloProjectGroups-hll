import { create } from 'zustand';
import type {
  RbdImage,
  RbdImageDetail,
  SnapshotTreeNode,
  PoolStats,
  ActivityItem,
  SnapshotSchedule,
  ExportDiffRequest,
  ExportDiffResult,
} from '../types';
import { rbdApi } from '../api/rbdApi';

interface RbdState {
  images: RbdImage[];
  loadingImages: boolean;
  selectedImage: RbdImageDetail | null;
  loadingImageDetail: boolean;
  snapshotTree: SnapshotTreeNode[];
  loadingSnapshotTree: boolean;
  poolStats: PoolStats | null;
  activities: ActivityItem[];
  selectedNode: SnapshotTreeNode | null;
  drawerOpen: boolean;
  cloneDialogOpen: boolean;
  createSnapDialogOpen: boolean;
  scheduleDialogOpen: boolean;
  exportDiffDialogOpen: boolean;
  confirmDialog: {
    open: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    danger?: boolean;
  };
  notifications: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>;
  schedules: SnapshotSchedule[];
  loadingSchedules: boolean;
  lastExportResult: ExportDiffResult | null;

  fetchImages: (pool?: string) => Promise<void>;
  fetchImageDetail: (pool: string, name: string) => Promise<void>;
  fetchPoolStats: () => Promise<void>;
  fetchSnapshotTree: () => Promise<void>;
  refreshAll: () => Promise<void>;

  setSelectedNode: (node: SnapshotTreeNode | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setCloneDialogOpen: (open: boolean) => void;
  setCreateSnapDialogOpen: (open: boolean) => void;
  setScheduleDialogOpen: (open: boolean) => void;
  setExportDiffDialogOpen: (open: boolean) => void;
  setLastExportResult: (result: ExportDiffResult | null) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    danger?: boolean
  ) => void;
  closeConfirm: () => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;
  addActivity: (type: ActivityItem['type'], message: string) => void;

  createSnapshot: (pool: string, name: string, snapshotName: string) => Promise<void>;
  rollbackSnapshot: (pool: string, name: string, snap: string) => Promise<void>;
  deleteSnapshot: (pool: string, name: string, snap: string, force?: boolean) => Promise<void>;
  cloneSnapshot: (
    pool: string,
    name: string,
    snap: string,
    newPool: string,
    newImageName: string,
    size?: number
  ) => Promise<void>;

  exportDiff: (pool: string, name: string, options: ExportDiffRequest) => Promise<void>;

  fetchSchedules: () => Promise<void>;
  createSchedule: (data: Omit<SnapshotSchedule, 'id' | 'createdAt'>) => Promise<void>;
  updateSchedule: (id: string, data: Partial<SnapshotSchedule>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleSchedule: (id: string, enabled: boolean) => Promise<void>;
  reloadSchedules: () => Promise<void>;
}

export const useRbdStore = create<RbdState>((set, get) => ({
  images: [],
  loadingImages: false,
  selectedImage: null,
  loadingImageDetail: false,
  snapshotTree: [],
  loadingSnapshotTree: false,
  poolStats: null,
  activities: [],
  selectedNode: null,
  drawerOpen: false,
  cloneDialogOpen: false,
  createSnapDialogOpen: false,
  scheduleDialogOpen: false,
  exportDiffDialogOpen: false,
  confirmDialog: {
    open: false,
    title: '',
    message: '',
    danger: false,
  },
  notifications: [],
  schedules: [],
  loadingSchedules: false,
  lastExportResult: null,

  fetchImages: async (pool) => {
    set({ loadingImages: true });
    try {
      const res = await rbdApi.listImages(pool);
      if (res.success && res.data) {
        set({ images: res.data });
      }
    } catch (e) {
      console.error('Failed to fetch images:', e);
    } finally {
      set({ loadingImages: false });
    }
  },

  fetchImageDetail: async (pool, name) => {
    set({ loadingImageDetail: true });
    try {
      const res = await rbdApi.getImageDetail(pool, name);
      if (res.success && res.data) {
        set({ selectedImage: res.data, drawerOpen: true });
      }
    } catch (e) {
      console.error('Failed to fetch image detail:', e);
    } finally {
      set({ loadingImageDetail: false });
    }
  },

  fetchPoolStats: async () => {
    try {
      const res = await rbdApi.getPoolStats();
      if (res.success && res.data) {
        set({ poolStats: res.data });
      }
    } catch (e) {
      console.error('Failed to fetch pool stats:', e);
    }
  },

  fetchSnapshotTree: async () => {
    set({ loadingSnapshotTree: true });
    try {
      const res = await rbdApi.getSnapshotTree();
      if (res.success && res.data) {
        set({ snapshotTree: res.data });
      }
    } catch (e) {
      console.error('Failed to fetch snapshot tree:', e);
    } finally {
      set({ loadingSnapshotTree: false });
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().fetchImages(),
      get().fetchPoolStats(),
      get().fetchSnapshotTree(),
      get().fetchSchedules(),
    ]);
  },

  setSelectedNode: (node) => set({ selectedNode: node }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setCloneDialogOpen: (open) => set({ cloneDialogOpen: open }),
  setCreateSnapDialogOpen: (open) => set({ createSnapDialogOpen: open }),
  setScheduleDialogOpen: (open) => set({ scheduleDialogOpen: open }),
  setExportDiffDialogOpen: (open) => set({ exportDiffDialogOpen: open }),
  setLastExportResult: (result) => set({ lastExportResult: result }),

  showConfirm: (title, message, onConfirm, danger) =>
    set({
      confirmDialog: { open: true, title, message, onConfirm, danger },
    }),

  closeConfirm: () =>
    set({
      confirmDialog: { open: false, title: '', message: '', danger: false },
    }),

  addNotification: (type, message) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      notifications: [...state.notifications, { id, type, message }],
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, 4000);
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  addActivity: (type, message) =>
    set((state) => ({
      activities: [
        { id: Math.random().toString(36).substring(7), type, message, timestamp: new Date().toISOString() },
        ...state.activities,
      ].slice(0, 20),
    })),

  createSnapshot: async (pool, name, snapshotName) => {
    const res = await rbdApi.createSnapshot(pool, name, snapshotName);
    if (res.success) {
      get().addNotification('success', res.message || 'Snapshot created successfully');
      get().addActivity('create', res.message || 'Snapshot created');
      await get().refreshAll();
    } else {
      get().addNotification('error', res.error || 'Failed to create snapshot');
    }
  },

  rollbackSnapshot: async (pool, name, snap) => {
    const res = await rbdApi.rollbackSnapshot(pool, name, snap);
    if (res.success) {
      get().addNotification('success', res.message || 'Rollback successful');
      get().addActivity('rollback', res.message || 'Rollback executed');
      await get().refreshAll();
    } else {
      get().addNotification('error', res.error || 'Failed to rollback');
    }
  },

  deleteSnapshot: async (pool, name, snap, force) => {
    const res = await rbdApi.deleteSnapshot(pool, name, snap, force);
    if (res.success) {
      get().addNotification('success', res.message || 'Snapshot deleted');
      get().addActivity('delete', res.message || 'Snapshot deleted');
      await get().refreshAll();
    } else {
      get().addNotification('error', res.error || 'Failed to delete snapshot');
    }
  },

  cloneSnapshot: async (pool, name, snap, newPool, newImageName, size) => {
    const res = await rbdApi.cloneSnapshot(pool, name, snap, newPool, newImageName, size);
    if (res.success) {
      get().addNotification('success', res.message || 'Clone successful');
      get().addActivity('clone', res.message || 'Clone created');
      get().setCloneDialogOpen(false);
      await get().refreshAll();
    } else {
      get().addNotification('error', res.error || 'Failed to clone snapshot');
    }
  },

  exportDiff: async (pool, name, options) => {
    const res = await rbdApi.exportDiff(pool, name, options);
    if (res.success && res.data) {
      get().addNotification('success', res.message || 'Export diff successful');
      get().addActivity('export-diff', res.message || 'Export diff created');
      set({ lastExportResult: res.data, exportDiffDialogOpen: false });
    } else {
      get().addNotification('error', res.error || 'Failed to export diff');
    }
  },

  fetchSchedules: async () => {
    set({ loadingSchedules: true });
    try {
      const res = await rbdApi.listSchedules();
      if (res.success && res.data) {
        set({ schedules: res.data });
      }
    } catch (e) {
      console.error('Failed to fetch schedules:', e);
    } finally {
      set({ loadingSchedules: false });
    }
  },

  createSchedule: async (data) => {
    const res = await rbdApi.createSchedule(data);
    if (res.success) {
      get().addNotification('success', 'Schedule created successfully');
      get().addActivity('schedule', `Created schedule: ${data.name}`);
      get().setScheduleDialogOpen(false);
      await get().fetchSchedules();
    } else {
      get().addNotification('error', res.error || 'Failed to create schedule');
    }
  },

  updateSchedule: async (id, data) => {
    const res = await rbdApi.updateSchedule(id, data);
    if (res.success) {
      get().addNotification('success', 'Schedule updated successfully');
      get().addActivity('schedule', `Updated schedule: ${id}`);
      await get().fetchSchedules();
    } else {
      get().addNotification('error', res.error || 'Failed to update schedule');
    }
  },

  deleteSchedule: async (id) => {
    const res = await rbdApi.deleteSchedule(id);
    if (res.success) {
      get().addNotification('success', 'Schedule deleted successfully');
      get().addActivity('schedule', `Deleted schedule: ${id}`);
      await get().fetchSchedules();
    } else {
      get().addNotification('error', res.error || 'Failed to delete schedule');
    }
  },

  toggleSchedule: async (id, enabled) => {
    const res = await rbdApi.toggleSchedule(id, enabled);
    if (res.success) {
      get().addNotification('success', `Schedule ${enabled ? 'enabled' : 'disabled'} successfully`);
      await get().fetchSchedules();
    } else {
      get().addNotification('error', res.error || 'Failed to toggle schedule');
    }
  },

  reloadSchedules: async () => {
    const res = await rbdApi.reloadSchedules();
    if (res.success) {
      get().addNotification('success', res.message || 'Schedules reloaded');
      await get().fetchSchedules();
    } else {
      get().addNotification('error', res.error || 'Failed to reload schedules');
    }
  },
}));
