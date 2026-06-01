const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const { getWkdHash, parseEmail } = require('../utils/openpgp');

const wkdCache = new Map();
const CACHE_TTL = 3600000;

const getCachedKey = (hash) => {
  const cached = wkdCache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.key;
  }
  wkdCache.delete(hash);
  return null;
};

const setCachedKey = (hash, key) => {
  wkdCache.set(hash, {
    key,
    timestamp: Date.now()
  });
};

router.get('/:domain/hu/:hash', async (req, res) => {
  try {
    const { domain, hash } = req.params;
    
    const cachedKey = getCachedKey(`${domain}:${hash}`);
    if (cachedKey) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', 'attachment');
      return res.send(cachedKey);
    }
    
    const keys = await Key.findAll(1000);
    let matchedKey = null;
    
    for (const key of keys) {
      const userIds = key.user_ids || [];
      for (const uid of userIds) {
        if (uid.email && uid.email.toLowerCase().includes(domain.toLowerCase())) {
          const wkdInfo = getWkdHash(uid.email);
          if (wkdInfo && wkdInfo.hash === hash) {
            matchedKey = key;
            break;
          }
        }
      }
      if (matchedKey) break;
    }
    
    if (!matchedKey) {
      return res.status(404).send('Not found');
    }
    
    const openpgp = require('openpgp');
    const publicKey = await openpgp.readKey({ armoredKey: matchedKey.public_key });
    const binaryKey = publicKey.write();
    
    setCachedKey(`${domain}:${hash}`, binaryKey);
    
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment');
    res.send(binaryKey);
  } catch (error) {
    console.error('WKD lookup error:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/hu/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const host = req.headers.host || '';
    const domain = host.split(':')[0];
    
    const cachedKey = getCachedKey(`${domain}:${hash}`);
    if (cachedKey) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', 'attachment');
      return res.send(cachedKey);
    }
    
    const keys = await Key.findAll(1000);
    let matchedKey = null;
    
    for (const key of keys) {
      const userIds = key.user_ids || [];
      for (const uid of userIds) {
        if (uid.email) {
          const wkdInfo = getWkdHash(uid.email);
          if (wkdInfo && wkdInfo.hash === hash && wkdInfo.domain === domain.toLowerCase()) {
            matchedKey = key;
            break;
          }
        }
      }
      if (matchedKey) break;
    }
    
    if (!matchedKey) {
      return res.status(404).send('Not found');
    }
    
    const openpgp = require('openpgp');
    const publicKey = await openpgp.readKey({ armoredKey: matchedKey.public_key });
    const binaryKey = publicKey.write();
    
    setCachedKey(`${domain}:${hash}`, binaryKey);
    
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment');
    res.send(binaryKey);
  } catch (error) {
    console.error('WKD direct lookup error:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/:domain/policy', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('');
});

router.get('/policy', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('');
});

router.post('/lookup', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    const parsedEmail = parseEmail(email);
    if (!parsedEmail) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    const wkdInfo = getWkdHash(email);
    
    const key = await Key.findByEmail(email);
    
    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'Key not found for this email'
      });
    }
    
    res.json({
      success: true,
      wkd: wkdInfo,
      key: {
        fingerprint: key.fingerprint,
        keyId: key.key_id,
        userIds: key.user_ids,
        wkdUrl: wkdInfo ? `https://${wkdInfo.domain}${wkdInfo.advancedPath}` : null
      }
    });
  } catch (error) {
    console.error('WKD lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
