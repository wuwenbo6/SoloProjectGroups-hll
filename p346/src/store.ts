import { create } from 'zustand';
import type { AuthResponse, AuthorizeResponse, User, AuthPolicy } from './types';

interface AppState {
  currentUser: string | null;
  sessionId: number | null;
  authResponse: AuthResponse | null;
  authorizeResponse: AuthorizeResponse | null;
  users: User[];
  policies: AuthPolicy[];
  sharedSecret: string;
  isLoading: boolean;
  error: string | null;

  setCurrentUser: (user: string | null) => void;
  setSessionId: (id: number | null) => void;
  setAuthResponse: (response: AuthResponse | null) => void;
  setAuthorizeResponse: (response: AuthorizeResponse | null) => void;
  setUsers: (users: User[]) => void;
  setPolicies: (policies: AuthPolicy[]) => void;
  setSharedSecret: (secret: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetAuth: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  sessionId: null,
  authResponse: null,
  authorizeResponse: null,
  users: [],
  policies: [],
  sharedSecret: 'tacacs_secret',
  isLoading: false,
  error: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setSessionId: (id) => set({ sessionId: id }),
  setAuthResponse: (response) => set({ authResponse: response }),
  setAuthorizeResponse: (response) => set({ authorizeResponse: response }),
  setUsers: (users) => set({ users }),
  setPolicies: (policies) => set({ policies }),
  setSharedSecret: (secret) => set({ sharedSecret: secret }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  resetAuth: () => set({
    currentUser: null,
    sessionId: null,
    authResponse: null,
    authorizeResponse: null,
  }),
}));
