import type { ApiResponse } from '../types';

const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && options.method !== 'GET' && options.method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return data as ApiResponse<T>;
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || 'Network error',
    };
  }
}

export const api = {
  get<T>(endpoint: string, params?: Record<string, any>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return request<T>(`${endpoint}${queryString}`, { method: 'GET' });
  },

  post<T>(endpoint: string, data?: any) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return request<T>(endpoint, { method: 'POST', body });
  },

  put<T>(endpoint: string, data?: any) {
    return request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'DELETE' });
  },

  upload<T>(endpoint: string, formData: FormData, onProgress?: (progress: number) => void) {
    return new Promise<ApiResponse<T>>((resolve) => {
      const xhr = new XMLHttpRequest();
      const token = getToken();

      xhr.open('POST', `${BASE_URL}${endpoint}`);
      
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (err) {
          resolve({
            success: false,
            error: 'Invalid response from server',
          });
        }
      };

      xhr.onerror = () => {
        resolve({
          success: false,
          error: 'Network error during upload',
        });
      };

      xhr.send(formData);
    });
  },

  download(endpoint: string) {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(`${BASE_URL}${endpoint}`, { headers });
  },
};
