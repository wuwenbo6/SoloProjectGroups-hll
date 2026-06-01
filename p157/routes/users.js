const express = require('express');
const router = express.Router();
const ldapService = require('../services/ldapService');
const { requireAuth } = require('../middleware/auth');
const { validatePassword } = require('../utils/validators');

router.get('/', requireAuth, async (req, res) => {
  const { ou, page, pageSize } = req.query;
  try {
    const p = parseInt(page) || 1;
    const ps = parseInt(pageSize) || 50;
    
    if (page || pageSize) {
      const result = await ldapService.getUsersPaginated(req.session.ldapConfig, ou, p, ps);
      res.json({
        success: true,
        ...result
      });
    } else {
      const users = await ldapService.getUsers(req.session.ldapConfig, ou);
      res.json({
        success: true,
        users
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '获取用户列表失败'
    });
  }
});

router.get('/:dn', requireAuth, async (req, res) => {
  const dn = decodeURIComponent(req.params.dn);
  try {
    const user = await ldapService.getUser(req.session.ldapConfig, dn);
    if (user) {
      res.json({
        success: true,
        user
      });
    } else {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '获取用户信息失败'
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { ou, uid, cn, sn, givenName, mail, telephoneNumber, userPassword } = req.body;

  if (!ou || !uid || !cn || !sn) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数（ou, uid, cn, sn）'
    });
  }

  if (!userPassword) {
    return res.status(400).json({
      success: false,
      message: '请设置用户密码'
    });
  }

  const passwordValidation = validatePassword(userPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  const userData = { uid, cn, sn, userPassword };
  if (givenName) userData.givenName = givenName;
  if (mail) userData.mail = mail;
  if (telephoneNumber) userData.telephoneNumber = telephoneNumber;

  try {
    const user = await ldapService.createUser(req.session.ldapConfig, ou, userData);
    res.status(201).json({
      success: true,
      user
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '创建用户失败'
    });
  }
});

router.put('/:dn', requireAuth, async (req, res) => {
  const dn = decodeURIComponent(req.params.dn);
  const { cn, sn, givenName, mail, telephoneNumber } = req.body;

  const userData = {};
  if (cn !== undefined) userData.cn = cn;
  if (sn !== undefined) userData.sn = sn;
  if (givenName !== undefined) userData.givenName = givenName;
  if (mail !== undefined) userData.mail = mail;
  if (telephoneNumber !== undefined) userData.telephoneNumber = telephoneNumber;

  if (Object.keys(userData).length === 0) {
    return res.status(400).json({
      success: false,
      message: '没有提供要更新的字段'
    });
  }

  try {
    const result = await ldapService.updateUser(req.session.ldapConfig, dn, userData);
    res.json({
      success: true,
      message: '用户信息已更新'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '更新用户失败'
    });
  }
});

router.delete('/:dn', requireAuth, async (req, res) => {
  const dn = decodeURIComponent(req.params.dn);
  try {
    await ldapService.deleteUser(req.session.ldapConfig, dn);
    res.json({
      success: true,
      message: '用户已删除'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '删除用户失败'
    });
  }
});

router.put('/:dn/password', requireAuth, async (req, res) => {
  const dn = decodeURIComponent(req.params.dn);
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      message: '新密码不能为空'
    });
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  try {
    await ldapService.resetPassword(req.session.ldapConfig, dn, newPassword);
    res.json({
      success: true,
      message: '密码已重置'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '重置密码失败'
    });
  }
});

module.exports = router;
