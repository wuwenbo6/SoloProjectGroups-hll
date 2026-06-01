import { useCallback } from 'react';
import { useDataStore } from '../store/useDataStore';
import type {
  UWBDataPoint,
  KalmanParams,
  FilterResult,
  TagData,
  MultiTagFilterResult,
} from '../types';

const API_BASE = 'http://localhost:3001/api/filter';

export function useKalmanFilter() {
  const {
    setRawData,
    setMultiTagData,
    setFilteredResult,
    setMultiTagFilterResult,
    setProcessing,
    setUploadStatus,
    kalmanParams,
    tags,
    activeTagId,
  } = useDataStore();

  const uploadFile = useCallback(async (file: File) => {
    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setRawData(result.data.data, result.data.filename);
        setUploadStatus('success');
        return result.data.data;
      } else {
        setUploadStatus('error', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      setUploadStatus('error', error instanceof Error ? error.message : '上传失败');
      throw error;
    }
  }, [setRawData, setUploadStatus]);

  const processFilter = useCallback(
    async (data: UWBDataPoint[], tagId: string, params?: KalmanParams) => {
      setProcessing(true);
      try {
        const response = await fetch(`${API_BASE}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data,
            params: params || kalmanParams,
          }),
        });

        const result = await response.json();
        if (result.success) {
          const filterResult = result.data as FilterResult;
          setFilteredResult(tagId, filterResult.filteredData, filterResult.statistics);
          return filterResult;
        } else {
          throw new Error(result.error);
        }
      } finally {
        setProcessing(false);
      }
    },
    [kalmanParams, setFilteredResult, setProcessing]
  );

  const processMultiTagFilter = useCallback(
    async (params?: KalmanParams) => {
      if (tags.length === 0) return null;

      setProcessing(true);
      try {
        const requestTags = tags.map((tag) => ({
          tagId: tag.tagId,
          data: tag.originalData,
        }));

        const response = await fetch(`${API_BASE}/process-multi`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tags: requestTags,
            params: params || kalmanParams,
            sharedParams: true,
          }),
        });

        const result = await response.json();
        if (result.success) {
          const filterResult = result.data as MultiTagFilterResult;
          setMultiTagFilterResult(filterResult);
          return filterResult;
        } else {
          throw new Error(result.error);
        }
      } finally {
        setProcessing(false);
      }
    },
    [kalmanParams, tags, setMultiTagFilterResult, setProcessing]
  );

  const loadSampleData = useCallback(async () => {
    setUploadStatus('uploading');
    try {
      const response = await fetch(`${API_BASE}/sample`);
      const result = await response.json();
      if (result.success) {
        setRawData(result.data.data, result.data.filename);
        setUploadStatus('success');
        return result.data.data;
      } else {
        setUploadStatus('error', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      setUploadStatus('error', error instanceof Error ? error.message : '加载失败');
      throw error;
    }
  }, [setRawData, setUploadStatus]);

  const loadMultiTagSampleData = useCallback(async () => {
    setUploadStatus('uploading');
    try {
      const response = await fetch(`${API_BASE}/sample-multi`);
      const result = await response.json();
      if (result.success) {
        setMultiTagData(result.data as TagData[]);
        setUploadStatus('success');
        return result.data as TagData[];
      } else {
        setUploadStatus('error', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      setUploadStatus('error', error instanceof Error ? error.message : '加载失败');
      throw error;
    }
  }, [setMultiTagData, setUploadStatus]);

  const processActiveTagFilter = useCallback(async () => {
    const activeTag = tags.find((t) => t.tagId === activeTagId);
    if (!activeTag) return null;
    return processFilter(activeTag.originalData, activeTag.tagId);
  }, [activeTagId, tags, processFilter]);

  return {
    uploadFile,
    processFilter,
    processMultiTagFilter,
    loadSampleData,
    loadMultiTagSampleData,
    processActiveTagFilter,
  };
}
