const express = require('express');
const router = express.Router();
const ldifService = require('../services/ldifService');

function requireAuth(req, res, next) {
  if (req.session && req.session.ldapConfig && req.session.ldapConfig.connected) {
    next();
  } else {
    res.status(401).json({ success: false, message: '未连接到LDAP服务器' });
  }
}

router.get('/export', requireAuth, async (req, res) => {
  try {
    const { baseDn, scope, filter } = req.query;
    const ldifContent = await ldifService.exportToLDIF(req.session.ldapConfig, {
      baseDn,
      scope,
      filter
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ldap-export-${timestamp}.ldif`;
    
    res.setHeader('Content-Type', 'application/x-ldif; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ldifContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/export-users', requireAuth, async (req, res) => {
  try {
    const { ou } = req.query;
    const ldifContent = await ldifService.exportUsersToLDIF(req.session.ldapConfig, ou);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `users-export-${timestamp}.ldif`;
    
    res.setHeader('Content-Type', 'application/x-ldif; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ldifContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/import', requireAuth, async (req, res) => {
  try {
    const { ldifContent } = req.body;
    
    if (!ldifContent || ldifContent.trim() === '') {
      return res.status(400).json({ success: false, message: 'LDIF内容不能为空' });
    }
    
    const result = await ldifService.importFromLDIF(req.session.ldapConfig, ldifContent);
    
    res.json({
      success: result.success,
      message: result.success ? `成功导入 ${result.successCount} 条记录` : `导入完成：成功 ${result.successCount} 条，失败 ${result.failedCount} 条`,
      total: result.total,
      successCount: result.successCount,
      failedCount: result.failedCount,
      results: result.results
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
