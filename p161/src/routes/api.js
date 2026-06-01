const express = require('express');
const router = express.Router();
const Key = require('../models/Key');
const { parsePublicKey, formatFingerprint } = require('../utils/openpgp');

router.get('/keys', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const keys = await Key.findAll(limit);
    
    const formattedKeys = keys.map(key => ({
      id: key.id,
      fingerprint: key.fingerprint,
      fingerprintFormatted: formatFingerprint(key.fingerprint),
      keyId: key.key_id,
      algorithm: key.algorithm,
      keySize: key.key_size,
      createdAt: key.created_at,
      expiresAt: key.expires_at,
      revoked: key.revoked,
      userIds: key.user_ids ? key.user_ids.filter(u => u && (u.name || u.email)) : []
    }));
    
    res.json({
      success: true,
      count: formattedKeys.length,
      keys: formattedKeys
    });
  } catch (error) {
    console.error('Error fetching keys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/keys/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 20;
    
    if (!query.trim()) {
      return res.json({
        success: true,
        count: 0,
        keys: []
      });
    }
    
    const keys = await Key.search(query, limit);
    
    const formattedKeys = keys.map(key => ({
      id: key.id,
      fingerprint: key.fingerprint,
      fingerprintFormatted: formatFingerprint(key.fingerprint),
      keyId: key.key_id,
      algorithm: key.algorithm,
      keySize: key.key_size,
      createdAt: key.created_at,
      expiresAt: key.expires_at,
      revoked: key.revoked,
      userIds: key.user_ids ? key.user_ids.filter(u => u && (u.name || u.email)) : []
    }));
    
    res.json({
      success: true,
      count: formattedKeys.length,
      keys: formattedKeys
    });
  } catch (error) {
    console.error('Error searching keys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/keys/:fingerprint', async (req, res) => {
  try {
    const fingerprint = req.params.fingerprint.replace(/\s/g, '').toUpperCase();
    
    let key = await Key.findByFingerprint(fingerprint);
    
    if (!key && fingerprint.length <= 16) {
      key = await Key.findByKeyId(fingerprint);
    }
    
    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'Key not found'
      });
    }
    
    const formattedKey = {
      id: key.id,
      fingerprint: key.fingerprint,
      fingerprintFormatted: formatFingerprint(key.fingerprint),
      keyId: key.key_id,
      algorithm: key.algorithm,
      keySize: key.key_size,
      createdAt: key.created_at,
      expiresAt: key.expires_at,
      revoked: key.revoked,
      publicKey: key.public_key,
      userIds: key.user_ids ? key.user_ids.filter(u => u && (u.name || u.email)) : []
    };
    
    res.json({
      success: true,
      key: formattedKey
    });
  } catch (error) {
    console.error('Error fetching key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/keys', async (req, res) => {
  try {
    const { publicKey } = req.body;
    
    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Public key is required'
      });
    }
    
    const result = await parsePublicKey(publicKey);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
    await Key.create(result.keyData, result.userIds, result.signatures || []);
    
    res.json({
      success: true,
      message: 'Key added successfully',
      fingerprint: result.keyData.fingerprint,
      keyId: result.keyData.keyId,
      signaturesCount: (result.signatures || []).length
    });
  } catch (error) {
    console.error('Error adding key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const count = await Key.count();
    
    res.json({
      success: true,
      stats: {
        totalKeys: count
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/keys/:fingerprint/signatures', async (req, res) => {
  try {
    const fingerprint = req.params.fingerprint.replace(/\s/g, '').toUpperCase();
    
    let key = await Key.findByFingerprint(fingerprint);
    
    if (!key && fingerprint.length <= 16) {
      key = await Key.findByKeyId(fingerprint);
    }
    
    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'Key not found'
      });
    }
    
    const signatures = await Key.getSignatures(key.id);
    const signed = await Key.getSignedBy(key.key_id);
    
    res.json({
      success: true,
      key: {
        fingerprint: key.fingerprint,
        keyId: key.key_id,
        userIds: key.user_ids
      },
      signatures: signatures.map(sig => ({
        signerKeyId: sig.signer_key_id,
        signerFingerprint: sig.signer_fingerprint,
        signerUserIds: sig.signer_user_ids,
        signatureType: sig.signature_type,
        signedAt: sig.signed_at,
        inDb: !!sig.signer_fingerprint
      })),
      signed: signed.map(sig => ({
        keyId: sig.key_id,
        fingerprint: sig.fingerprint,
        userIds: sig.user_ids,
        signedAt: sig.signed_at
      }))
    });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/keys/:fingerprint/web-of-trust', async (req, res) => {
  try {
    const fingerprint = req.params.fingerprint.replace(/\s/g, '').toUpperCase();
    const depth = parseInt(req.query.depth) || 2;
    
    const wot = await Key.getWebOfTrust(fingerprint, depth);
    
    if (!wot) {
      return res.status(404).json({
        success: false,
        error: 'Key not found'
      });
    }
    
    res.json({
      success: true,
      ...wot
    });
  } catch (error) {
    console.error('Error fetching web of trust:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/wkd/lookup', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }
    
    const { getWkdHash } = require('../utils/openpgp');
    const wkdInfo = getWkdHash(email);
    
    if (!wkdInfo) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
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
        fingerprintFormatted: formatFingerprint(key.fingerprint),
        keyId: key.key_id,
        userIds: key.user_ids
      }
    });
  } catch (error) {
    console.error('Error in WKD lookup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
