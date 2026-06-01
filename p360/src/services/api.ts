import type {
  Document,
  ApiResponse,
  InsertResponse,
  UpdateResponse,
  DeleteResponse,
  CollectionResponse,
  EventsResponse,
  ChangeEvent,
} from '../../shared/types.js';

const API_BASE = '/api/collection';

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  return response.json();
}

export const api = {
  async insert(data: Record<string, any>): Promise<ApiResponse<InsertResponse>> {
    return request<InsertResponse>(`${API_BASE}/insert`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  },

  async update(id: string, data: Record<string, any>): Promise<ApiResponse<UpdateResponse>> {
    return request<UpdateResponse>(`${API_BASE}/update/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
  },

  async delete(id: string): Promise<ApiResponse<DeleteResponse>> {
    return request<DeleteResponse>(`${API_BASE}/delete/${id}`, {
      method: 'DELETE',
    });
  },

  async getCollection(): Promise<ApiResponse<CollectionResponse>> {
    return request<CollectionResponse>(`${API_BASE}`, {
      method: 'GET',
    });
  },

  async getEvents(resumeAfter?: string): Promise<ApiResponse<EventsResponse>> {
    const url = resumeAfter
      ? `${API_BASE}/events?resumeAfter=${encodeURIComponent(resumeAfter)}`
      : `${API_BASE}/events`;
    return request<EventsResponse>(url, {
      method: 'GET',
    });
  },

  async clear(): Promise<ApiResponse> {
    return request(`${API_BASE}/clear`, {
      method: 'POST',
    });
  },
};
