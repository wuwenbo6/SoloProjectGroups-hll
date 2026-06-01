import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  insertProgramFile,
  getAllProgramFiles,
  getProgramFileById,
  createDownloadLog,
  updateDownloadProgress,
  getDownloadStatus,
} from '../database/index.js';
import { broadcastDownloadProgress } from '../websocket/index.js';
import { getLatestData } from '../opcua/client.js';
import {
  validateProgramFile,
  validatePlcState,
  validateDownloadConditions,
  ValidationResult,
} from '../utils/programValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });
const router = Router();

router.get('/', (req, res) => {
  try {
    const programs = getAllProgramFiles();
    res.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch programs',
    });
  }
});

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const validation = validateProgramFile(req.file.path);
    
    if (!validation.valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'File validation failed',
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    const version = req.body.version || '1.0.0';
    const result = insertProgramFile(
      req.file.originalname,
      version,
      req.file.path,
      req.file.size
    );

    res.json({
      success: true,
      data: {
        id: (result as any).lastInsertRowid,
        filename: req.file.originalname,
        version,
        size: req.file.size,
        checksum: validation.checks.checksum,
      },
      validation: {
        warnings: validation.warnings,
      },
    });
  } catch (error) {
    console.error('Error uploading program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload program',
    });
  }
});

router.get('/:id/validate', (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const program = getProgramFileById(programId);

    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found',
      });
    }

    const fileValidation = validateProgramFile((program as any).filepath);
    const plcData = getLatestData();
    const plcState = validatePlcState(plcData);
    const downloadConditions = validateDownloadConditions(fileValidation, plcState);

    res.json({
      success: true,
      data: {
        program: {
          id: (program as any).id,
          filename: (program as any).filename,
          version: (program as any).version,
        },
        fileValidation: {
          valid: fileValidation.valid,
          errors: fileValidation.errors,
          warnings: fileValidation.warnings,
          checks: fileValidation.checks,
        },
        plcState: {
          safe: plcState.safe,
          errors: plcState.errors,
          currentData: {
            temperature: plcData.temperature,
            pressure: plcData.pressure,
            alarm: plcData.alarm,
          },
        },
        canDownload: downloadConditions.allowed,
        blockReasons: downloadConditions.reasons,
      },
    });
  } catch (error) {
    console.error('Error validating program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate program',
    });
  }
});

router.post('/:id/download', (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const program = getProgramFileById(programId);

    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found',
      });
    }

    const forceDownload = req.body.force === true;

    const fileValidation = validateProgramFile((program as any).filepath);
    const plcData = getLatestData();
    const plcState = validatePlcState(plcData);
    const downloadConditions = validateDownloadConditions(fileValidation, plcState);

    if (!downloadConditions.allowed && !forceDownload) {
      return res.status(400).json({
        success: false,
        error: 'Download conditions not met',
        details: {
          blockReasons: downloadConditions.reasons,
          fileValidation: {
            valid: fileValidation.valid,
            errors: fileValidation.errors,
          },
          plcState: {
            safe: plcState.safe,
            errors: plcState.errors,
          },
        },
      });
    }

    if (forceDownload && !downloadConditions.allowed) {
      console.warn(`Forcing download despite conditions: ${downloadConditions.reasons.join(', ')}`);
    }

    const result = createDownloadLog(programId);
    const downloadId = (result as any).lastInsertRowid;

    simulateRemoteDownload(downloadId);

    res.json({
      success: true,
      data: {
        downloadId,
        program: {
          id: (program as any).id,
          filename: (program as any).filename,
          version: (program as any).version,
        },
        status: 'downloading',
        checksum: fileValidation.checks.checksum,
        warnings: fileValidation.warnings,
      },
    });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start download',
    });
  }
});

router.get('/:id/download/status', (req, res) => {
  try {
    const downloadId = parseInt(req.params.id);
    const status = getDownloadStatus(downloadId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Download not found',
      });
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error fetching download status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch download status',
    });
  }
});

function simulateRemoteDownload(downloadId: number) {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 10) + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      updateDownloadProgress(downloadId, 100, 'completed');
      broadcastDownloadProgress(downloadId, 100, 'completed');
    } else {
      updateDownloadProgress(downloadId, progress, 'downloading');
      broadcastDownloadProgress(downloadId, progress, 'downloading');
    }
  }, 500);
}

export default router;
