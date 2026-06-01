import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { parsePluginZip } from '../utils/metadata-parser';
import { pluginService } from './plugin.service';

const storageDir = path.resolve(process.env.STORAGE_PATH || './storage', 'plugins');
const iconDir = path.resolve(process.env.STORAGE_PATH || './storage', 'icons');

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qgis-plugin-upload-'));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.zip');
  },
});

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/zip' || 
      file.mimetype === 'application/x-zip-compressed' ||
      file.originalname.endsWith('.zip')) {
    cb(null, true);
  } else {
    cb(new Error('Only zip files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

export class UploadService {
  async processUpload(
    filePath: string,
    originalName: string,
    userId?: string
  ) {
    try {
      const parsed = parsePluginZip(filePath, storageDir, iconDir);
      
      fs.unlinkSync(filePath);

      const plugin = await pluginService.createPlugin({
        metadata: parsed.metadata,
        filename: parsed.filename,
        fileSize: parsed.fileSize,
        md5Hash: parsed.md5Hash,
        iconPath: parsed.iconPath,
        userId,
      });

      return {
        success: true,
        plugin,
        parsed,
      };
    } catch (err) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw err;
    }
  }

  validatePlugin(zipPath: string) {
    try {
      const parsed = parsePluginZip(zipPath, tempDir, tempDir);
      return {
        valid: true,
        metadata: parsed.metadata,
      };
    } catch (err) {
      return {
        valid: false,
        error: (err as Error).message,
      };
    } finally {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  }
}

export const uploadService = new UploadService();
