import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ParseResult, ParseError, ParseOptions } from '../../shared/types';
import { deserializeParseResult } from '../utils/deserialize';

export function useFileUpload() {
  const {
    setIsLoading,
    setUploadProgress,
    setParseResult,
    setError,
    setSelectedPacket,
    setSelectedDetail,
    setActiveFilter,
    timeReference,
    pcmDeinterleave,
    useIndexCache
  } = useAppStore();

  const uploadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setUploadProgress(0);
    setError(null);
    setSelectedPacket(null);
    setSelectedDetail(null);
    setActiveFilter(null);

    const formData = new FormData();
    formData.append('file', file);

    const options: ParseOptions = {};
    if (timeReference.enabled) {
      options.timeReference = timeReference;
    }
    if (pcmDeinterleave.enabled) {
      options.pcmDeinterleave = pcmDeinterleave;
    }
    if (useIndexCache) {
      options.useIndexCache = true;
    }

    if (options.timeReference || options.pcmDeinterleave || options.useIndexCache) {
      formData.append('timeReference', JSON.stringify(options.timeReference));
      formData.append('pcmDeinterleave', JSON.stringify(options.pcmDeinterleave));
      if (options.useIndexCache) {
        formData.append('useIndexCache', 'true');
      }
    }

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      const responsePromise = new Promise<ParseResult>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const raw = JSON.parse(xhr.responseText);
              const result = deserializeParseResult(raw);
              resolve(result);
            } catch (e) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const error: ParseError = JSON.parse(xhr.responseText);
              reject(new Error(error.error || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const result = await responsePromise;
      
      if (result.success) {
        setParseResult(result);
      } else {
        throw new Error(result.errors?.[0] || 'Parse failed');
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  }, [setIsLoading, setUploadProgress, setParseResult, setError, setSelectedPacket, setSelectedDetail, setActiveFilter, timeReference, pcmDeinterleave, useIndexCache]);

  const loadSampleData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSelectedPacket(null);
    setSelectedDetail(null);
    setActiveFilter(null);

    try {
      const response = await fetch('/api/upload/sample');
      if (!response.ok) {
        throw new Error('Failed to load sample data');
      }
      const raw = await response.json();
      const result = deserializeParseResult(raw);
      setParseResult(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setParseResult, setError, setSelectedPacket, setSelectedDetail, setActiveFilter]);

  return { uploadFile, loadSampleData };
}
