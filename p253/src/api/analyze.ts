import type { AnalysisResult, AnalyzeResponse } from "../../shared/types";

export async function analyzeFile(file: File, onProgress?: (percent: number) => void): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: AnalyzeResponse = JSON.parse(xhr.responseText);
          if (response.success && response.data) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || "解析失败"));
          }
        } catch {
          reject(new Error("响应解析失败"));
        }
      } else {
        try {
          const response: AnalyzeResponse = JSON.parse(xhr.responseText);
          reject(new Error(response.error || `服务器错误 (${xhr.status})`));
        } catch {
          reject(new Error(`服务器错误 (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络错误")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));

    xhr.open("POST", "/api/analyze");
    xhr.send(formData);
  });
}
