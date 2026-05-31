import type { SceneMetadata, MaterialConfig, CameraState, ApiResponse } from '../../shared/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export const api = {
  scenes: {
    list: async (): Promise<ApiResponse<{ scenes: SceneMetadata[] }>> => {
      return request<{ scenes: SceneMetadata[] }>('/scenes');
    },

    get: async (id: string): Promise<ApiResponse<SceneMetadata>> => {
      return request<SceneMetadata>(`/scenes/${id}`);
    },

    create: async (name: string, modelPath: string = ''): Promise<ApiResponse<SceneMetadata>> => {
      return request<SceneMetadata>('/scenes', {
        method: 'POST',
        body: JSON.stringify({ name, modelPath }),
      });
    },

    update: async (id: string, updates: Partial<SceneMetadata>): Promise<ApiResponse<SceneMetadata>> => {
      return request<SceneMetadata>(`/scenes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    delete: async (id: string): Promise<ApiResponse<void>> => {
      return request<void>(`/scenes/${id}`, {
        method: 'DELETE',
      });
    },

    updateMaterials: async (sceneId: string, materials: MaterialConfig[]): Promise<ApiResponse<SceneMetadata>> => {
      return request<SceneMetadata>(`/scenes/${sceneId}/materials`, {
        method: 'PUT',
        body: JSON.stringify({ materials }),
      });
    },

    updateCamera: async (sceneId: string, camera: CameraState): Promise<ApiResponse<SceneMetadata>> => {
      return request<SceneMetadata>(`/scenes/${sceneId}/camera`, {
        method: 'PUT',
        body: JSON.stringify(camera),
      });
    },
  },

  upload: {
    files: async (files: File[], sceneId?: string): Promise<ApiResponse<{ scene: SceneMetadata; uploadedFiles: string[] }>> => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const url = sceneId ? `/upload/${sceneId}` : '/upload';
      
      try {
        const response = await fetch(`${API_BASE}${url}`, {
          method: 'POST',
          body: formData,
        });
        return await response.json();
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  },
};
