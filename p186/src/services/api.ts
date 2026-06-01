import axios from 'axios';
import type {
  ACE,
  GetACLResponse,
  SetACLResponse,
} from '../../shared/types';

const API_BASE_URL = '/api/acl';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function getACL(path: string): Promise<GetACLResponse> {
  try {
    const response = await apiClient.get<GetACLResponse>('/', {
      params: { path },
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as GetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch ACL',
    };
  }
}

export async function setACL(
  path: string,
  aces: ACE[]
): Promise<SetACLResponse> {
  try {
    const response = await apiClient.post<SetACLResponse>('/', {
      path,
      aces,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set ACL',
    };
  }
}

export async function addACE(
  path: string,
  newACE: ACE,
  existingACEs: ACE[]
): Promise<SetACLResponse> {
  try {
    const response = await apiClient.post<SetACLResponse>('/add', {
      path,
      newACE,
      existingACEs,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add ACE',
    };
  }
}

export async function updateACE(
  path: string,
  index: number,
  updatedACE: ACE,
  existingACEs: ACE[]
): Promise<SetACLResponse> {
  try {
    const response = await apiClient.post<SetACLResponse>('/update', {
      path,
      index,
      updatedACE,
      existingACEs,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update ACE',
    };
  }
}

export async function deleteACE(
  path: string,
  index: number,
  existingACEs: ACE[]
): Promise<SetACLResponse> {
  try {
    const response = await apiClient.post<SetACLResponse>('/delete', {
      path,
      index,
      existingACEs,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete ACE',
    };
  }
}

export async function clearACL(path: string): Promise<SetACLResponse> {
  try {
    const response = await apiClient.post<SetACLResponse>('/clear', {
      path,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as SetACLResponse;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear ACL',
    };
  }
}

export async function checkToolsAvailable(): Promise<boolean> {
  try {
    const response = await apiClient.get<{
      success: boolean;
      data: { available: boolean };
    }>('/tools-check');
    return response.data.data?.available ?? false;
  } catch {
    return false;
  }
}
