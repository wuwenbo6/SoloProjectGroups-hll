import { create } from 'zustand';
import type { User, AuthState } from '../types';
import { authService } from '../services/plugins';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  loading: boolean;
}

const getInitialState = (): AuthState => {
  const token = localStorage.getItem('auth_token');
  const userStr = localStorage.getItem('auth_user');
  const user = userStr ? JSON.parse(userStr) : null;

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
  };
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...getInitialState(),
  loading: false,

  setLoading: (loading) => set({ loading }),

  login: async (email, password) => {
    set({ loading: true });
    try {
      const result = await authService.login(email, password);
      
      if (result.success && result.data) {
        const { user, token } = result.data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));
        set({ user, token, isAuthenticated: true, loading: false });
        return { success: true };
      }
      
      set({ loading: false });
      return { success: false, error: result.error || 'Login failed' };
    } catch (err) {
      set({ loading: false });
      return { success: false, error: (err as Error).message };
    }
  },

  register: async (email, password, name) => {
    set({ loading: true });
    try {
      const result = await authService.register(email, password, name);
      
      if (result.success && result.data) {
        const { user, token } = result.data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));
        set({ user, token, isAuthenticated: true, loading: false });
        return { success: true };
      }
      
      set({ loading: false });
      return { success: false, error: result.error || 'Registration failed' };
    } catch (err) {
      set({ loading: false });
      return { success: false, error: (err as Error).message };
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) return;

    try {
      const result = await authService.getMe();
      if (result.success && result.data) {
        localStorage.setItem('auth_user', JSON.stringify(result.data));
        set({ user: result.data as User, isAuthenticated: true });
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        set({ user: null, token: null, isAuthenticated: false });
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  },
}));
