import { create } from 'zustand';
import type {
  MessageRecord,
  ProducerStatus,
  ProducerStats,
  SendMessageResponse,
  PIDState,
  TransactionState,
} from '../../shared/types';

interface ProducerStore {
  status: ProducerStatus | null;
  messages: MessageRecord[];
  stats: ProducerStats | null;
  pidStates: PIDState[];
  transactions: TransactionState[];
  loading: boolean;
  lastMessageId: string | null;
  isDuplicateMessage: boolean;
  
  fetchStatus: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchPIDStates: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  sendMessage: (content: string, partition?: number) => Promise<SendMessageResponse>;
  sendDuplicateMessage: (
    content: string,
    pid: number,
    sequence: number,
    partition?: number
  ) => Promise<SendMessageResponse>;
  beginTransaction: (transactionalId?: string) => Promise<TransactionState>;
  sendTransactionalMessage: (content: string, partition: number) => Promise<SendMessageResponse>;
  commitTransaction: () => Promise<TransactionState>;
  abortTransaction: () => Promise<TransactionState>;
  resetProducer: () => Promise<void>;
  toggleIdempotence: (enable: boolean) => Promise<void>;
  exportStats: (format: 'json' | 'csv') => void;
  clearLastMessage: () => void;
}

const API_BASE = '/api/producer';

async function refreshAll(get: () => ProducerStore) {
  await get().fetchStatus();
  await get().fetchMessages();
  await get().fetchPIDStates();
  await get().fetchTransactions();
}

export const useProducerStore = create<ProducerStore>((set, get) => ({
  status: null,
  messages: [],
  stats: null,
  pidStates: [],
  transactions: [],
  loading: false,
  lastMessageId: null,
  isDuplicateMessage: false,

  fetchStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      set({ status: data });
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  },

  fetchMessages: async () => {
    try {
      const res = await fetch(`${API_BASE}/messages`);
      const data = await res.json();
      set({ messages: data.messages, stats: data.stats });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  },

  fetchPIDStates: async () => {
    try {
      const res = await fetch(`${API_BASE}/pid-states`);
      const data = await res.json();
      set({ pidStates: data.pidStates });
    } catch (error) {
      console.error('Failed to fetch PID states:', error);
    }
  },

  fetchTransactions: async () => {
    try {
      const res = await fetch(`${API_BASE}/transactions`);
      const data = await res.json();
      set({ transactions: data.transactions });
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  },

  sendMessage: async (content: string, partition: number = 0) => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, partition }),
      });
      const data = await res.json();
      
      set({
        lastMessageId: data.message.id,
        isDuplicateMessage: data.isDuplicate,
      });
      
      await refreshAll(get);
      return data;
    } finally {
      set({ loading: false });
    }
  },

  sendDuplicateMessage: async (
    content: string,
    pid: number,
    sequence: number,
    partition: number = 0
  ) => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/send-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, pid, sequence, partition }),
      });
      const data = await res.json();
      
      set({
        lastMessageId: data.message.id,
        isDuplicateMessage: data.isDuplicate,
      });
      
      await refreshAll(get);
      return data;
    } finally {
      set({ loading: false });
    }
  },

  beginTransaction: async (transactionalId?: string) => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/transaction/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionalId }),
      });
      const data = await res.json();
      await get().fetchStatus();
      await get().fetchTransactions();
      return data.transaction;
    } finally {
      set({ loading: false });
    }
  },

  sendTransactionalMessage: async (content: string, partition: number) => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/transaction/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, partition }),
      });
      const data = await res.json();
      
      set({
        lastMessageId: data.message.id,
        isDuplicateMessage: data.isDuplicate,
      });
      
      await refreshAll(get);
      return data;
    } finally {
      set({ loading: false });
    }
  },

  commitTransaction: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/transaction/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      await refreshAll(get);
      return data.transaction;
    } finally {
      set({ loading: false });
    }
  },

  abortTransaction: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/transaction/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      await refreshAll(get);
      return data.transaction;
    } finally {
      set({ loading: false });
    }
  },

  resetProducer: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      
      set({
        status: data.status,
        messages: [],
        stats: null,
        lastMessageId: null,
        isDuplicateMessage: false,
      });
      
      await refreshAll(get);
    } finally {
      set({ loading: false });
    }
  },

  toggleIdempotence: async (enable: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/toggle-idempotence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable }),
      });
      const data = await res.json();
      
      set((state) => ({
        status: state.status
          ? { ...state.status, enableIdempotence: data.enableIdempotence }
          : null,
      }));
    } catch (error) {
      console.error('Failed to toggle idempotence:', error);
    }
  },

  exportStats: (format: 'json' | 'csv') => {
    window.open(`${API_BASE}/export/${format}`, '_blank');
  },

  clearLastMessage: () => {
    set({ lastMessageId: null, isDuplicateMessage: false });
  },
}));
