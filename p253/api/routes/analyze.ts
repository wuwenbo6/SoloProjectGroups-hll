import { Router, type Request, type Response } from "express";
import multer from "multer";
import { parseTSFile } from "../services/tsParser.js";
import { storeFile } from "../services/fileCache.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().endsWith(".ts");
    const mime = file.mimetype === "video/mp2t" || file.mimetype === "application/octet-stream";
    cb(null, ext || mime);
  },
});

router.post("/", upload.single("file"), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "请上传 .ts 文件" });
    return;
  }

  try {
    const buffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileId = storeFile(buffer, fileName);
    const result = parseTSFile(buffer, fileName);
    res.json({ success: true, data: { ...result, fileId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
