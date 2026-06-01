const { verifyToken } = require('../utils/jwt');
const { getClientIp, verifyIpBinding } = require('../utils/ip');

const ENABLE_IP_BINDING = process.env.ENABLE_IP_BINDING !== 'false';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '缺少Token' });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }

  if (ENABLE_IP_BINDING && result.decoded.ip) {
    const clientIp = getClientIp(req);
    if (!verifyIpBinding(result.decoded.ip, clientIp)) {
      return res.status(403).json({ 
        error: 'IP不匹配',
        tokenIp: result.decoded.ip,
        clientIp: clientIp
      });
    }
  }

  req.user = result.decoded;
  req.token = token;
  next();
}

module.exports = {
  authenticateToken,
};
