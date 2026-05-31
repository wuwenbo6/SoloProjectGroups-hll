const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { runInsert, runQuery } = require('../database/db');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('只允许上传图片和PDF文件'));
    }
  }
});

router.post('/image/:produceId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const imageURL = `/uploads/${req.file.filename}`;
    
    await runInsert(
      'INSERT INTO produce_images (produce_id, image_url, image_type, uploaded_by) VALUES (?, ?, ?, ?)',
      [req.params.produceId, imageURL, req.file.mimetype, req.user.username]
    );

    res.json({
      success: true,
      imageURL,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ error: error.message || '上传图片失败' });
  }
});

router.post('/report/:reportId/:produceId', authenticateToken, upload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const fileURL = `/uploads/${req.file.filename}`;
    
    await runInsert(
      'INSERT INTO report_files (report_id, produce_id, file_url, file_name, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [req.params.reportId, req.params.produceId, fileURL, req.file.originalname, req.user.username]
    );

    res.json({
      success: true,
      fileURL,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('上传报告失败:', error);
    res.status(500).json({ error: error.message || '上传报告失败' });
  }
});

router.get('/images/:produceId', async (req, res) => {
  try {
    const images = await runQuery(
      'SELECT * FROM produce_images WHERE produce_id = ? ORDER BY uploaded_at DESC',
      [req.params.produceId]
    );
    res.json(images);
  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

router.get('/reports/:produceId', async (req, res) => {
  try {
    const reports = await runQuery(
      'SELECT * FROM report_files WHERE produce_id = ? ORDER BY uploaded_at DESC',
      [req.params.produceId]
    );
    res.json(reports);
  } catch (error) {
    console.error('获取报告列表失败:', error);
    res.status(500).json({ error: '获取报告列表失败' });
  }
});

module.exports = router;
