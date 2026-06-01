import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'hpav-uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const PROJECT_ROOT = path.resolve(process.cwd());
const PARSER_PATH = path.join(PROJECT_ROOT, 'cpp-parser', 'build', 'hpav-parser');

function isParserAvailable(): boolean {
  return fs.existsSync(PARSER_PATH);
}

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  if (!isParserAvailable()) {
    const filePath = req.file.path;
    fs.unlink(filePath, () => {});
    res.status(500).json({
      success: false,
      error: 'C++ parser not available. Please build the parser first: cd cpp-parser && g++ -std=c++17 -O2 -o build/hpav-parser src/main.cpp src/FrameParser.cpp src/MacHeaderParser.cpp src/SofParser.cpp src/SignalingParser.cpp src/JsonBuilder.cpp -Isrc',
    });
    return;
  }

  const filePath = req.file.path;

  execFile(PARSER_PATH, [filePath], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    fs.unlink(filePath, () => {});

    if (error) {
      res.status(500).json({
        success: false,
        error: `Parser error: ${stderr || error.message}`,
      });
      return;
    }

    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch {
      res.status(500).json({
        success: false,
        error: 'Invalid parser output',
      });
    }
  });
});

export default router;
