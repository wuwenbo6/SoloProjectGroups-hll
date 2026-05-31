import axios from 'axios';
import { UploadedFile, Detection, DetectionResult, PointCloudData, MapResult, PRCurveData } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadPCD = async (file: File): Promise<UploadedFile> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getFiles = async (): Promise<UploadedFile[]> => {
  const response = await api.get('/files');
  return response.data.files;
};

export const getFileInfo = async (fileId: string): Promise<UploadedFile> => {
  const response = await api.get(`/files/${fileId}`);
  return response.data;
};

export const deleteFile = async (fileId: string): Promise<void> => {
  await api.delete(`/files/${fileId}`);
};

export const getPointCloud = async (fileId: string): Promise<PointCloudData> => {
  const response = await api.get(`/pointcloud/${fileId}`);
  return response.data;
};

export const runDetection = async (fileId: string): Promise<DetectionResult> => {
  const response = await api.post(`/detect/${fileId}`);
  return response.data;
};

export const getDetections = async (fileId: string): Promise<DetectionResult> => {
  const response = await api.get(`/detections/${fileId}`);
  return response.data;
};

export const getAllDetections = async (): Promise<Detection[]> => {
  const response = await api.get('/detections');
  return response.data.detections;
};

export const getMapMetrics = async (): Promise<MapResult> => {
  const response = await api.get('/metrics/map');
  return response.data;
};

export const getPRCurve = async (className: string = 'Car'): Promise<PRCurveData> => {
  const response = await api.get(`/metrics/pr-curve?class=${className}`);
  return response.data;
};

export const healthCheck = async (): Promise<{ status: string; message: string }> => {
  const response = await api.get('/health');
  return response.data;
};

export default api;
