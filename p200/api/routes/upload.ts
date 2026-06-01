import { Router, type Request, type Response } from "express"
import multer from "multer"
import { v4 as uuidv4 } from "uuid"
import { setCSVData, getCSVData } from "../services/cache.js"

const router = Router()

const storage = multer.memoryStorage()
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

interface MulterRequest extends Request {
  file?: Express.Multer.File
}

const FIELD_ALIASES: Record<string, string[]> = {
  latitude: ["lat", "latitude", "纬度", "纬", "纬度坐标", "纬度值", "y"],
  longitude: ["lon", "lng", "longitude", "经度", "经", "经度坐标", "经度值", "x"],
  rsrp: ["rsrp", "参考信号接收功率", "接收功率", "信号功率", "路测rsrp", "rsrp值"],
  sinr: ["sinr", "信干噪比", "信噪比", "信号质量", "路测sinr", "sinr值"],
};

function detectFieldMapping(headers: string[]) {
  const detected: {
    latitude?: string;
    longitude?: string;
    rsrp?: string;
    sinr?: string;
  } = {};

  const lowerHeaders = headers.map((h) => h.toLowerCase());

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      const idx = lowerHeaders.findIndex(
        (h) => h === aliasLower || h.includes(aliasLower)
      );
      if (idx !== -1 && !detected[field as keyof typeof detected]) {
        detected[field as keyof typeof detected] = headers[idx];
        break;
      }
    }
  }

  return detected;
}

router.post("/", upload.single("file"), (req: Request, res: Response) => {
  const multerReq = req as MulterRequest;
  try {
    if (!multerReq.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    const content = multerReq.file.buffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      res.status(400).json({ success: false, message: "CSV file is empty" });
      return;
    }

    const columns = lines[0].split(",").map((h) => h.trim());
    const detectedFields = detectFieldMapping(columns);

    if (!detectedFields.latitude || !detectedFields.longitude) {
      res.status(400).json({
        success: false,
        message: "Could not find latitude/longitude columns",
      });
      return;
    }

    const preview: Array<Record<string, string>> = [];
    for (let i = 1; i < Math.min(lines.length, 21); i++) {
      const values = lines[i].split(",");
      const row: Record<string, string> = {};
      columns.forEach((h, j) => {
        row[h] = values[j]?.trim() || "";
      });
      preview.push(row);
    }

    const fileId = uuidv4();
    const allRows = lines.slice(1).map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      columns.forEach((h, j) => {
        row[h] = values[j]?.trim() || "";
      });
      return row;
    });

    setCSVData(fileId, {
      fileId,
      columns,
      rowCount: allRows.length,
      rows: allRows,
    });

    res.json({
      success: true,
      fileId,
      columns,
      preview,
      rowCount: allRows.length,
      detectedFields,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: "Failed to parse CSV" });
  }
})

router.get("/:fileId", (req: Request, res: Response) => {
  const { fileId } = req.params;
  const data = getCSVData(fileId);
  if (!data) {
    res.status(404).json({ success: false, message: "File not found" });
    return;
  }
  res.json({
    success: true,
    fileId,
    columns: data.columns,
    rowCount: data.rowCount,
    preview: data.rows.slice(0, 20),
  });
})

export default router
