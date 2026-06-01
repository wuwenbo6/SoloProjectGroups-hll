import { useEffect, useRef } from "react";
import { useCaptureStore } from "@/hooks/useCaptureStore";

export function usePolling(intervalMs = 2000) {
  const refresh = useCaptureStore((s) => s.refresh);
  const status = useCaptureStore((s) => s.status);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    refresh();

    timerRef.current = setInterval(() => {
      refresh();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, intervalMs]);

  return { status };
}
