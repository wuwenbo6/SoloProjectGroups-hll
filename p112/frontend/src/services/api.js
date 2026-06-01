import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const estimateResources = async (code, codeName) => {
  const response = await api.post('/estimate', { code, codeName });
  return response.data;
};

export const getHistory = async () => {
  const response = await api.get('/history');
  return response.data;
};

export const getHistoryDetail = async (id) => {
  const response = await api.get(`/history/${id}`);
  return response.data;
};

export const deleteHistory = async (id) => {
  const response = await api.delete(`/history/${id}`);
  return response.data;
};

export const exportJSONReport = async (code, codeName) => {
  const response = await api.post('/report/json', { code, codeName }, {
    responseType: 'blob'
  });
  return response.data;
};

export const exportHTMLReport = async (code, codeName) => {
  const response = await api.post('/report/html', { code, codeName }, {
    responseType: 'blob'
  });
  return response.data;
};

export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export default api;
