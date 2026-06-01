import { useCallback } from 'react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { compileCode as apiCompileCode } from '@/services/api';

export function useCompile() {
  const {
    code,
    selectedPasses,
    setCompileResult,
    setIsCompiling,
    setError,
    setSelectedFunction,
  } = useLLVMStore();

  const compile = useCallback(async () => {
    setIsCompiling(true);
    setError(null);

    try {
      const result = await apiCompileCode(code, selectedPasses);

      if (result.success) {
        setCompileResult(result);
        if (result.cfgs && result.cfgs.length > 0) {
          setSelectedFunction(result.cfgs[0].functionName);
        }
      } else {
        setError(result.error || 'Compilation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compilation failed');
    } finally {
      setIsCompiling(false);
    }
  }, [code, selectedPasses, setCompileResult, setIsCompiling, setError, setSelectedFunction]);

  return { compile };
}
