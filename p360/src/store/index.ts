import { create } from 'zustand';
import type { Document } from '../../shared/types.js';

interface CollectionState {
  documents: Document[];
  loading: boolean;
  error: string | null;
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
  documents: [],
  loading: false,
  error: null,
  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),
  updateDocument: (doc) =>
    set((state) => ({
      documents: state.documents.map((d) => (d._id === doc._id ? doc : d)),
    })),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((d) => d._id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clear: () => set({ documents: [], error: null }),
}));

interface UiState {
  selectedDocumentId: string | null;
  expandedEventId: string | null;
  activeTab: 'operations' | 'events' | 'collection';
  setSelectedDocumentId: (id: string | null) => void;
  setExpandedEventId: (id: string | null) => void;
  setActiveTab: (tab: 'operations' | 'events' | 'collection') => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedDocumentId: null,
  expandedEventId: null,
  activeTab: 'operations',
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),
  setExpandedEventId: (id) => set({ expandedEventId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
