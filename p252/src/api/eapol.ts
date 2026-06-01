import type { AnalyzeResponse } from "@/types/eapol";

const API_BASE = "/api";

export async function uploadAndAnalyze(file: File): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/analyze/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Upload failed");
  }

  return res.json();
}

export async function loadSampleData(): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/analyze/sample`);

  if (!res.ok) {
    throw new Error("Failed to load sample data");
  }

  return res.json();
}
