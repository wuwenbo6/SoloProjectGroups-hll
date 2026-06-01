function requireAuth(req, res, next) {
  if (req.session && req.session.ldapConfig && req.session.ldapConfig.connected) {
    next();
  } else {
    res.status(401).json({ success: false, message: '未授权，请先登录' });
  }
}

module.exports = { requireAuth };
