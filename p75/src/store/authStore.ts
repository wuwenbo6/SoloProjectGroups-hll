import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const API_BASE = 'http://localhost:3001/api';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('auth_token'),
  isAuthenticated: !!localStorage.getItem('auth_token'),

  login: async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success) {
        const { token, user } = result.data;
        localStorage.setItem('auth_token', token);
        set({
          user,
          token,
          isAuthenticated: true,
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  checkAuth: async (): Promise<boolean> => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        set({
          user: result.data,
          token,
          isAuthenticated: true,
        });
        return true;
      }

      localStorage.removeItem('auth_token');
      set({ isAuthenticated: false, user: null });
      return false;
    } catch (error) {
      console.error('Auth check error:', error);
      return false;
    }
  },
}));

export function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  return {};
}
