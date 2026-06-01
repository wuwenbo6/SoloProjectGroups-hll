const express = require('express');
const router = express.Router();
const backupManager = require('./backupManager');
const scheduler = require('./scheduler');
const remoteBackupManager = require('./remoteBackup');
const checksumManager = require('./checksum');

router.get('/vms', async (req, res) => {
  try {
    const vms = await backupManager.getVMList();
    res.json({ success: true, data: vms });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/vms/sync', async (req, res) => {
  try {
    const vms = await backupManager.syncVMsFromLibvirt();
    res.json({ success: true, data: vms });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/vms/:vmId/backups', async (req, res) => {
  try {
    const chain = await backupManager.getBackupChain(req.params.vmId);
    res.json({ success: true, data: chain });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/vms/:vmId/backups/stats', async (req, res) => {
  try {
    const stats = await backupManager.getBackupChainStats(req.params.vmId);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/vms/:vmId/backups/merge', async (req, res) => {
  try {
    const { targetBackupId } = req.body;
    const result = await backupManager.mergeBackupChain(req.params.vmId, targetBackupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/vms/:vmId/backup/full', async (req, res) => {
  try {
    const { vmName } = req.body;
    const result = await backupManager.createFullBackup(req.params.vmId, vmName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/vms/:vmId/backup/incremental', async (req, res) => {
  try {
    const { vmName } = req.body;
    const result = await backupManager.createIncrementalBackup(req.params.vmId, vmName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/:backupId', async (req, res) => {
  try {
    const backup = await backupManager.getBackupInfo(req.params.backupId);
    res.json({ success: true, data: backup });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/:backupId/can-delete', async (req, res) => {
  try {
    const result = await backupManager.canDeleteBackup(req.params.backupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/backups/:backupId', async (req, res) => {
  try {
    const { force = false } = req.body || {};
    const result = await backupManager.deleteBackup(req.params.backupId, force);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/:backupId/mount', async (req, res) => {
  try {
    const result = await backupManager.mountBackup(req.params.backupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/:backupId/unmount', async (req, res) => {
  try {
    const result = await backupManager.unmountBackup(req.params.backupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/:backupId/browse', async (req, res) => {
  try {
    const { path = '/' } = req.query;
    const files = await backupManager.browseFiles(req.params.backupId, path);
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/:backupId/restore', async (req, res) => {
  try {
    const { deleteSubsequent = false } = req.body || {};
    const result = await backupManager.restoreBackup(req.params.backupId, deleteSubsequent);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/:backupId/checksum/verify', async (req, res) => {
  try {
    const result = await backupManager.verifyBackupChecksum(req.params.backupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/:backupId/checksum/export', async (req, res) => {
  try {
    const result = await backupManager.exportChecksumFile(req.params.backupId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/policies', async (req, res) => {
  try {
    const policies = await scheduler.getPolicies();
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/policies/vm/:vmId', async (req, res) => {
  try {
    const policies = await new Promise((resolve, reject) => {
      const db = require('./database');
      db.all(
        `SELECT * FROM backup_policies WHERE vm_id = ? ORDER BY created_at DESC`,
        [req.params.vmId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/policies', async (req, res) => {
  try {
    const policy = await scheduler.createPolicy(req.body);
    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/policies/:id', async (req, res) => {
  try {
    const policy = await scheduler.updatePolicy(req.params.id, req.body);
    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/policies/:id', async (req, res) => {
  try {
    const result = await scheduler.deletePolicy(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/policies/:id/logs', async (req, res) => {
  try {
    const logs = await scheduler.getPolicyLogs(req.params.id);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cron/validate', async (req, res) => {
  try {
    const { expression } = req.body;
    const valid = scheduler.validateCronExpression(expression);
    const nextRuns = valid ? scheduler.getNextRuns(expression, 5) : [];
    res.json({ success: true, data: { valid, nextRuns } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/remote/configs', async (req, res) => {
  try {
    const configs = await remoteBackupManager.getConfigs();
    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/remote/configs', async (req, res) => {
  try {
    const config = await remoteBackupManager.createConfig(req.body);
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/remote/configs/:id', async (req, res) => {
  try {
    const result = await remoteBackupManager.updateConfig(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/remote/configs/:id', async (req, res) => {
  try {
    const result = await remoteBackupManager.deleteConfig(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/remote/configs/:id/test', async (req, res) => {
  try {
    const result = await remoteBackupManager.testConnection(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/remote/backups', async (req, res) => {
  try {
    const { backupId } = req.query;
    const backups = await remoteBackupManager.getRemoteBackups(backupId);
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/:backupId/remote/transfer', async (req, res) => {
  try {
    const { configId } = req.body;
    const result = await remoteBackupManager.transferBackup(req.params.backupId, configId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/remote/backups/:id', async (req, res) => {
  try {
    const result = await remoteBackupManager.deleteRemoteBackup(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
