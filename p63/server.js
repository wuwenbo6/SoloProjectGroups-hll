const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('./database/db');
const conversionQueue = require('./services/conversionQueue');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static('frontend'));

const uploadsDir = path.join(__dirname, 'uploads');
const downloadsDir = path.join(__dirname, 'downloads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.oasis.opendocument.text',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  const allowedExtensions = ['.odt', '.docx', '.doc'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only ODT, DOCX, and DOC files are allowed.'), false);
  }
};

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || 500) * 1024 * 1024;

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: maxFileSize
  }
});

app.post('/api/convert', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let formats = req.body.format || req.body.formats || 'pdf';
    if (typeof formats === 'string') {
      formats = formats.split(',').map(f => f.trim().toLowerCase());
    }
    formats = formats.filter(f => ['pdf', 'html'].includes(f));
    
    if (formats.length === 0) {
      return res.status(400).json({ error: 'Invalid format. Only PDF and HTML are supported.' });
    }

    let watermarkConfig = null;
    if (req.body.watermarkEnabled === 'true' || req.body.watermarkEnabled === true) {
      watermarkConfig = {
        enabled: true,
        text: req.body.watermarkText || 'CONFIDENTIAL',
        opacity: parseFloat(req.body.watermarkOpacity) || 0.3,
        fontSize: parseInt(req.body.watermarkFontSize) || 50,
        rotation: parseInt(req.body.watermarkRotation) || 45,
        spacing: parseInt(req.body.watermarkSpacing) || 200
      };
    }

    const createThumbnail = req.body.createThumbnail === 'true' || req.body.createThumbnail === true;

    const jobId = uuidv4();
    const inputPath = req.file.path;
    const outputBasePath = path.join(downloadsDir, jobId);

    await db.createConversion(
      jobId, 
      req.file.originalname, 
      inputPath, 
      formats,
      watermarkConfig,
      createThumbnail
    );

    conversionQueue.add({
      id: jobId,
      inputPath: inputPath,
      outputBasePath: outputBasePath,
      formats: formats,
      watermarkConfig: watermarkConfig,
      createThumbnail: createThumbnail
    });

    res.json({
      jobId: jobId,
      status: 'queued',
      formats: formats,
      message: 'Conversion job has been queued'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const conversion = await db.getConversion(jobId);

    if (!conversion) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: conversion.id,
      status: conversion.status,
      originalFilename: conversion.original_filename,
      formats: conversion.formats,
      hasThumbnail: !!conversion.thumbnail_path,
      watermarkEnabled: conversion.watermark_config?.enabled,
      createdAt: conversion.created_at,
      completedAt: conversion.completed_at,
      errorMessage: conversion.error_message
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:jobId/:format?', async (req, res) => {
  try {
    const { jobId, format = 'pdf' } = req.params;
    const conversion = await db.getConversion(jobId);

    if (!conversion) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (conversion.status !== 'completed') {
      return res.status(400).json({ error: 'Conversion not completed', status: conversion.status });
    }

    const outputPath = conversion.output_paths?.[format];
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ error: 'Output file not found for this format' });
    }

    const originalName = path.basename(conversion.original_filename, path.extname(conversion.original_filename));
    const downloadName = `${originalName}.${format}`;

    res.download(outputPath, downloadName);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/preview/:jobId/:format?', async (req, res) => {
  try {
    const { jobId, format = 'pdf' } = req.params;
    const conversion = await db.getConversion(jobId);

    if (!conversion) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (conversion.status !== 'completed') {
      return res.status(400).json({ error: 'Conversion not completed', status: conversion.status });
    }

    const outputPath = conversion.output_paths?.[format];
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ error: 'Output file not found for this format' });
    }

    const ext = path.extname(outputPath).toLowerCase();
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }

    fs.createReadStream(outputPath).pipe(res);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/thumbnail/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const conversion = await db.getConversion(jobId);

    if (!conversion) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!conversion.thumbnail_path || !fs.existsSync(conversion.thumbnail_path)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(conversion.thumbnail_path).pipe(res);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversions', async (req, res) => {
  try {
    const conversions = await db.getAllConversions();
    res.json(conversions);
  } catch (error) {
    console.error('Get conversions error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/conversions/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const conversion = await db.getConversion(jobId);

    if (!conversion) {
      return res.status(404).json({ error: 'Job not found' });
    }

    try {
      if (conversion.original_path && fs.existsSync(conversion.original_path)) {
        fs.unlinkSync(conversion.original_path);
      }
      if (conversion.output_paths) {
        Object.values(conversion.output_paths).forEach(p => {
          if (p && fs.existsSync(p)) {
            fs.unlinkSync(p);
          }
        });
      }
      if (conversion.thumbnail_path && fs.existsSync(conversion.thumbnail_path)) {
        fs.unlinkSync(conversion.thumbnail_path);
      }
    } catch (error) {
      console.error('Error deleting files:', error);
    }

    await db.deleteConversion(jobId);
    res.json({ message: 'Conversion deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue/status', (req, res) => {
  res.json({
    queued: conversionQueue.getQueueLength(),
    processing: conversionQueue.getProcessingCount()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const maxSizeMB = Math.round(maxFileSize / 1024 / 1024);
      return res.status(400).json({ error: `File too large. Maximum size is ${maxSizeMB}MB.` });
    }
  }
  res.status(500).json({ error: error.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Document Converter Server running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${uploadsDir}`);
  console.log(`Download directory: ${downloadsDir}`);
});
