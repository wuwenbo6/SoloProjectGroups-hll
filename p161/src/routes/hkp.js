const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const { parsePublicKey } = require('../utils/openpgp');

const formatUid = (uid) => {
  if (!uid) return '';
  const parts = [];
  if (uid.name) parts.push(uid.name);
  if (uid.comment) parts.push(`(${uid.comment})`);
  if (uid.email) parts.push(`<${uid.email}>`);
  return parts.join(' ');
};

const getIndexResponse = (key, verbose = false) => {
  const lines = [];
  const userIds = key.user_ids || [];
  const validUids = userIds.filter(u => u && (u.name || u.email));
  
  const created = key.created_at ? Math.floor(new Date(key.created_at).getTime() / 1000) : '';
  const expires = key.expires_at ? Math.floor(new Date(key.expires_at).getTime() / 1000) : '';
  
  lines.push(`pub:${key.fingerprint}:${key.algorithm || ''}:${key.key_size || ''}:${created}:${expires}::`);
  
  if (verbose) {
    for (const uid of validUids) {
      const uidStr = formatUid(uid);
      lines.push(`uid:${encodeURIComponent(uidStr)}:${created}:::`);
    }
  } else if (validUids.length > 0) {
    const uidStr = formatUid(validUids[0]);
    lines.push(`uid:${encodeURIComponent(uidStr)}:${created}:::`);
  }
  
  return lines.join('\n') + '\n';
};

const getMrResponse = (keys) => {
  const lines = [];
  lines.push(`info:1:${keys.length}`);
  
  for (const key of keys) {
    const userIds = key.user_ids || [];
    const validUids = userIds.filter(u => u && (u.name || u.email));
    
    const created = key.created_at ? Math.floor(new Date(key.created_at).getTime() / 1000) : '';
    const expires = key.expires_at ? Math.floor(new Date(key.expires_at).getTime() / 1000) : '';
    
    lines.push(`pub:${key.fingerprint}:${key.algorithm || ''}:${key.key_size || ''}:${created}:${expires}::`);
    
    for (const uid of validUids) {
      const uidStr = formatUid(uid);
      lines.push(`uid:${encodeURIComponent(uidStr)}:${created}:::`);
    }
  }
  
  return lines.join('\n') + '\n';
};

router.post('/add', async (req, res) => {
  try {
    let keytext = req.body.keytext || req.body.key;
    
    if (!keytext && req.rawBody) {
      keytext = req.rawBody.toString();
    }
    
    if (!keytext) {
      return res.status(400).send('Error: No key data provided');
    }
    
    if (typeof keytext === 'object') {
      keytext = JSON.stringify(keytext);
    }
    
    keytext = keytext.toString().trim();
    
    if (!keytext.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
      keytext = `-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n${keytext}\n-----END PGP PUBLIC KEY BLOCK-----`;
    }
    
    const result = await parsePublicKey(keytext);
    
    if (!result.success) {
      return res.status(400).send(`Error: Invalid public key - ${result.error}`);
    }
    
    await Key.create(result.keyData, result.userIds, result.signatures || []);
    
    res.set('Content-Type', 'text/plain');
    res.status(200).send(`Key ${result.keyData.fingerprint} added successfully.\n`);
  } catch (error) {
    console.error('Error adding key:', error);
    res.status(500).send(`Error: ${error.message}\n`);
  }
});

router.get('/lookup', async (req, res) => {
  try {
    const op = req.query.op || 'get';
    const search = req.query.search || '';
    const options = req.query.options || '';
    const fingerprint = req.query.fingerprint || '';
    
    if (!search && !fingerprint && op !== 'index' && op !== 'vindex') {
      return res.status(400).send('Error: No search query provided\n');
    }
    
    let keys = [];
    let query = search || fingerprint;
    
    if (op === 'index' || op === 'vindex') {
      if (query) {
        keys = await Key.search(query, 50);
      } else {
        keys = await Key.findAll(50);
      }
    } else if (op === 'get') {
      if (query.startsWith('0x')) {
        const keyId = query.slice(2).toUpperCase();
        const key = await Key.findByKeyId(keyId);
        if (key) keys = [key];
      } else if (/^[0-9A-Fa-f]{40}$/.test(query.replace(/\s/g, ''))) {
        const fp = query.replace(/\s/g, '').toUpperCase();
        const key = await Key.findByFingerprint(fp);
        if (key) keys = [key];
      } else {
        keys = await Key.search(query, 1);
      }
    } else {
      return res.status(400).send(`Error: Unsupported operation: ${op}\n`);
    }
    
    if (keys.length === 0) {
      return res.status(404).send('Error: Not found\n');
    }
    
    res.set('Content-Type', 'text/plain');
    
    if (options === 'mr') {
      return res.send(getMrResponse(keys));
    }
    
    if (op === 'index') {
      let response = `info:1:${keys.length}\n`;
      for (const key of keys) {
        response += getIndexResponse(key, false);
      }
      return res.send(response);
    }
    
    if (op === 'vindex') {
      let response = `info:1:${keys.length}\n`;
      for (const key of keys) {
        response += getIndexResponse(key, true);
      }
      return res.send(response);
    }
    
    if (op === 'get') {
      res.set('Content-Type', 'application/pgp-keys');
      res.set('Content-Disposition', `attachment; filename="${keys[0].fingerprint}.asc"`);
      return res.send(keys[0].public_key);
    }
    
    res.send(keys[0].public_key);
  } catch (error) {
    console.error('Error in lookup:', error);
    res.status(500).send(`Error: ${error.message}\n`);
  }
});

module.exports = router;
