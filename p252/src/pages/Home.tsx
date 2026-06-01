import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useEapolStore } from "@/store/eapolStore";
import { uploadAndAnalyze, loadSampleData } from "@/api/eapol";
import UploadZone from "@/components/UploadZone";

export default function HomePage() {
  const navigate = useNavigate();
  const { setLoading, setAnalysis, setError, loading, error } = useEapolStore();

  const handleFileSelect = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const result = await uploadAndAnalyze(file);
        setAnalysis(result);
        navigate(`/analysis/${result.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "解析失败");
      }
    },
    [navigate, setLoading, setAnalysis, setError]
  );

  const handleSampleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSampleData();
      setAnalysis(result);
      navigate(`/analysis/${result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载示例失败");
    }
  }, [navigate, setLoading, setAnalysis, setError]);

  return (
    <UploadZone
      onFileSelect={handleFileSelect}
      onSampleLoad={handleSampleLoad}
      loading={loading}
      error={error}
    />
  );
}
