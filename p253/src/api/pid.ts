import type { PIDBitrateHistory, BitrateHistoryResponse } from "../../shared/types";

export async function extractPIDPayload(fileId: string, pid: number, originalFileName: string): Promise<void> {
  const response = await fetch("/api/pid/payload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileId, pid }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `下载失败 (${response.status})`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const baseName = originalFileName.replace(/\.ts$/i, "");
  const fileName = `${baseName}_pid_0x${pid.toString(16).padStart(4, "0")}.es`;
  a.download = fileName;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function getBitrateHistory(
  fileId: string,
  pid: number
): Promise<PIDBitrateHistory> {
  const response = await fetch(`/api/pid/bitrate/${fileId}/${pid}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `获取码率历史失败 (${response.status})`);
  }

  const data: BitrateHistoryResponse = await response.json();
  if (!data.success || !data.data) {
    throw new Error(data.error || "获取码率历史失败");
  }
  return data.data;
}

export async function exportBitrateHistory(
  fileId: string,
  pid: number,
  originalFileName: string,
  format: "csv" | "json"
): Promise<void> {
  const response = await fetch(`/api/pid/bitrate/${fileId}/${pid}?format=${format}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `导出失败 (${response.status})`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const baseName = originalFileName.replace(/\.ts$/i, "");
  const ext = format === "csv" ? "csv" : "json";
  const fileName = `${baseName}_pid_0x${pid.toString(16).padStart(4, "0")}_bitrate.${ext}`;
  a.download = fileName;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
