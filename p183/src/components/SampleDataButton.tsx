import React, { useCallback, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';
import { MODEL_LABELS } from '../../shared/types';

const SampleDataButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { setLoading, setError, setFileName, modelType } = useFitStore();

  const handleLoadSample = useCallback(async () => {
    setIsLoading(true);
    setLoading(true);
    setError(null);
    setFileName(`示例数据_${MODEL_LABELS[modelType]}.csv`);

    try {
      const response = await fetch(`/api/sample?modelType=${modelType}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '加载示例数据失败');
      }

      const sampleData = result.data;
      const measuredData = sampleData.map((d: { v: number; i: number }) => ({
        v: d.v,
        i: d.i
      }));

      const formData = new FormData();
      const csvContent = 'V,I\n' + measuredData.map(d => `${d.v},${d.i}`).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      formData.append('file', blob, 'sample.csv');
      formData.append('modelType', modelType);

      const fitResponse = await fetch('/api/fit', {
        method: 'POST',
        body: formData,
      });

      const fitResult = await fitResponse.json();

      if (!fitResult.success) {
        throw new Error(fitResult.error || '拟合失败');
      }

      const { fittedData, parameters, statistics, spiceStatement } = fitResult.data;
      useFitStore.getState().setMeasuredData(measuredData);
      useFitStore.getState().setFittedData(fittedData);
      useFitStore.getState().setParameters(parameters);
      useFitStore.getState().setStatistics(statistics);
      useFitStore.getState().setSpiceStatement(spiceStatement);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  }, [modelType, setLoading, setError, setFileName]);

  return (
    <button
      onClick={handleLoadSample}
      disabled={isLoading}
      className="flex items-center justify-center space-x-2 w-full px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white font-medium rounded-xl hover:from-slate-800 hover:to-slate-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Database className="w-5 h-5" />
      )}
      <span>加载{MODEL_LABELS[modelType]}示例数据</span>
    </button>
  );
};

export default SampleDataButton;
