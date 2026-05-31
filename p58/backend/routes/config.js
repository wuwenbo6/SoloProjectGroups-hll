const express = require('express');
const router = express.Router();
const multer = require('multer');
const ConfigBackupService = require('../services/ConfigBackupService');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/export', async (req, res) => {
  try {
    const { include_passwords = 'false' } = req.query;
    const config = await ConfigBackupService.exportConfig({
      includePasswords: include_passwords === 'true',
      prettyPrint: true
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `config_backup_${timestamp}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(config);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backup', async (req, res) => {
  try {
    const result = await ConfigBackupService.saveBackupToFile();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups', (req, res) => {
  try {
    const backups = ConfigBackupService.listBackups();
    res.json({ success: true, backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/backups/:fileName', (req, res) => {
  try {
    const result = ConfigBackupService.deleteBackup(req.params.fileName);
    res.json({ success: result.deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const { overwrite = 'false', merge = 'true' } = req.body;
    let configData;

    if (req.file) {
      configData = req.file.buffer.toString('utf8');
    } else if (req.body.config) {
      configData = req.body.config;
    } else {
      return res.status(400).json({ success: false, error: 'No config data provided' });
    }

    const result = await ConfigBackupService.importConfig(configData, {
      overwrite: overwrite === 'true',
      merge: merge === 'true'
    });
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
