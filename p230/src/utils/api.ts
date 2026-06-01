import axios from 'axios';
import type { VerifyRequest, VerifyResponse, TrustAnchor } from '../../shared/types';

const API_BASE_URL = '/api/dnssec';

export const dnssecAPI = {
  verify: async (request: VerifyRequest): Promise<VerifyResponse> => {
    const response = await axios.post<VerifyResponse>(
      `${API_BASE_URL}/verify`,
      request
    );
    return response.data;
  },

  getTrustAnchors: async (): Promise<TrustAnchor[]> => {
    const response = await axios.get<{ success: boolean; anchors: TrustAnchor[] }>(
      `${API_BASE_URL}/trust-anchors`
    );
    return response.data.anchors;
  },

  addTrustAnchor: async (anchor: Omit<TrustAnchor, 'id' | 'createdAt'>): Promise<TrustAnchor> => {
    const response = await axios.post<{ success: boolean; anchor: TrustAnchor }>(
      `${API_BASE_URL}/trust-anchors`,
      anchor
    );
    return response.data.anchor;
  },

  removeTrustAnchor: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/trust-anchors/${id}`);
  },

  updateTrustAnchor: async (id: string, updates: Partial<Omit<TrustAnchor, 'id' | 'createdAt'>>): Promise<TrustAnchor> => {
    const response = await axios.put<{ success: boolean; anchor: TrustAnchor }>(
      `${API_BASE_URL}/trust-anchors/${id}`,
      updates
    );
    return response.data.anchor;
  },

  health: async (): Promise<{ status: string; timestamp: string }> => {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },
};
