import { Router, type Request, type Response } from "express";
import { extractPIDPayload, parseTSFile } from "../services/tsParser.js";
import { getFile, getFileName } from "../services/fileCache.js";
import type { PIDBitrateHistory } from "../../shared/types.js";

const router = Router();

router.post("/payload", (req: Request, res: Response): void => {
  try {
    const { fileId, pid } = req.body;

    if (!fileId || pid === undefined) {
      res.status(400).json({ success: false, error: "缺少 fileId 或 pid 参数" });
      return;
    }

    const targetPid = typeof pid === "string" ? parseInt(pid, 10) : pid;
    if (isNaN(targetPid) || targetPid < 0 || targetPid > 0x1fff) {
      res.status(400).json({ success: false, error: "无效的 PID" });
      return;
    }

    const buffer = getFile(fileId);
    if (!buffer) {
      res.status(404).json({ success: false, error: "文件已过期，请重新上传" });
      return;
    }

    const result = extractPIDPayload(buffer, targetPid);

    if (result.size === 0) {
      res.status(404).json({ success: false, error: "该 PID 没有有效负载数据" });
      return;
    }

    const originalName = getFileName(fileId) || "stream";
    const baseName = originalName.replace(/\.ts$/i, "");
    const fileName = `${baseName}_pid_0x${targetPid.toString(16).padStart(4, "0")}.es`;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", result.size);
    res.setHeader("X-PID", `0x${targetPid.toString(16).padStart(4, "0")}`);
    res.setHeader("X-Packet-Count", result.packetCount.toString());
    res.setHeader("X-Total-Size", result.size.toString());

    res.end(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "提取失败";
    res.status(500).json({ success: false, error: message });
  }
});

router.get("/bitrate/:fileId/:pid", (req: Request, res: Response): void => {
  try {
    const { fileId, pid } = req.params;
    const format = req.query.format as string;

    if (!fileId || pid === undefined) {
      res.status(400).json({ success: false, error: "缺少 fileId 或 pid 参数" });
      return;
    }

    const targetPid = parseInt(pid, 10);
    if (isNaN(targetPid) || targetPid < 0 || targetPid > 0x1fff) {
      res.status(400).json({ success: false, error: "无效的 PID" });
      return;
    }

    const buffer = getFile(fileId);
    if (!buffer) {
      res.status(404).json({ success: false, error: "文件已过期，请重新上传" });
      return;
    }

    const result = parseTSFile(buffer, "");
    const history = result.bitrateHistories.find((h: PIDBitrateHistory) => h.pid === targetPid);

    if (!history) {
      res.status(404).json({ success: false, error: "该 PID 没有码率历史数据" });
      return;
    }

    if (format === "csv") {
      const originalName = getFileName(fileId) || "stream";
      const baseName = originalName.replace(/\.ts$/i, "");
      const fileName = `${baseName}_pid_0x${targetPid.toString(16).padStart(4, "0")}_bitrate.csv`;

      let csvContent = "time_ms,bitrate_bps,byte_count,packet_count\n";
      for (const point of history.points) {
        csvContent += `${point.time},${point.bitrate},${point.byteCount},${point.packetCount}\n`;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.end(csvContent);
    } else if (format === "json") {
      const originalName = getFileName(fileId) || "stream";
      const baseName = originalName.replace(/\.ts$/i, "");
      const fileName = `${baseName}_pid_0x${targetPid.toString(16).padStart(4, "0")}_bitrate.json`;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.end(JSON.stringify(history, null, 2));
    } else {
      res.json({ success: true, data: history });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取码率历史失败";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
