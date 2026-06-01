const pool = require('../db');

class Key {
  static async create(keyData, userIds, signatures = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO keys (fingerprint, key_id, public_key, algorithm, key_size, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (fingerprint) DO UPDATE SET
           public_key = EXCLUDED.public_key,
           algorithm = EXCLUDED.algorithm,
           key_size = EXCLUDED.key_size,
           created_at = EXCLUDED.created_at,
           expires_at = EXCLUDED.expires_at
         RETURNING id`,
        [
          keyData.fingerprint,
          keyData.keyId,
          keyData.publicKey,
          keyData.algorithm,
          keyData.keySize,
          keyData.createdAt,
          keyData.expiresAt
        ]
      );

      const keyDbId = result.rows[0].id;

      await client.query('DELETE FROM user_ids WHERE key_id = $1', [keyDbId]);

      for (const uid of userIds) {
        await client.query(
          `INSERT INTO user_ids (key_id, name, email, comment)
           VALUES ($1, $2, $3, $4)`,
          [keyDbId, uid.name, uid.email, uid.comment]
        );
      }

      await client.query('DELETE FROM signatures WHERE signed_key_id = $1', [keyDbId]);

      for (const sig of signatures) {
        await client.query(
          `INSERT INTO signatures (signed_key_id, signer_key_id, signer_fingerprint, signature_type, signed_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (signed_key_id, signer_key_id) DO NOTHING`,
          [keyDbId, sig.signerKeyId, sig.signerFingerprint, sig.signatureType, sig.signedAt]
        );
      }

      await client.query('COMMIT');
      return keyDbId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async findByFingerprint(fingerprint) {
    const result = await pool.query(
      `SELECT k.*, array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM keys k
       LEFT JOIN user_ids u ON k.id = u.key_id
       WHERE k.fingerprint = $1
       GROUP BY k.id`,
      [fingerprint.toUpperCase()]
    );
    return result.rows[0] || null;
  }

  static async findByKeyId(keyId) {
    const result = await pool.query(
      `SELECT k.*, array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM keys k
       LEFT JOIN user_ids u ON k.id = u.key_id
       WHERE k.key_id = $1
       GROUP BY k.id`,
      [keyId.toUpperCase()]
    );
    return result.rows[0] || null;
  }

  static async search(query, limit = 20) {
    const searchTerm = `%${query}%`;
    const result = await pool.query(
      `SELECT DISTINCT k.*, array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM keys k
       LEFT JOIN user_ids u ON k.id = u.key_id
       WHERE k.fingerprint ILIKE $1
          OR k.key_id ILIKE $1
          OR u.name ILIKE $1
          OR u.email ILIKE $1
          OR u.comment ILIKE $1
       GROUP BY k.id
       ORDER BY k.created_at DESC
       LIMIT $2`,
      [searchTerm, limit]
    );
    return result.rows;
  }

  static async findAll(limit = 50) {
    const result = await pool.query(
      `SELECT k.*, array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM keys k
       LEFT JOIN user_ids u ON k.id = u.key_id
       GROUP BY k.id
       ORDER BY k.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async count() {
    const result = await pool.query('SELECT COUNT(*) FROM keys');
    return parseInt(result.rows[0].count, 10);
  }

  static async getSignatures(keyDbId) {
    const result = await pool.query(
      `SELECT s.*, k.fingerprint as signer_fingerprint, k.key_id as signer_key_id_display,
              array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as signer_user_ids
       FROM signatures s
       LEFT JOIN keys k ON s.signer_key_id = k.key_id
       LEFT JOIN user_ids u ON k.id = u.key_id
       WHERE s.signed_key_id = $1
       GROUP BY s.id, k.fingerprint, k.key_id
       ORDER BY s.signed_at DESC NULLS LAST`,
      [keyDbId]
    );
    return result.rows;
  }

  static async getSignedBy(signerKeyId) {
    const result = await pool.query(
      `SELECT s.*, k.fingerprint, k.key_id, k.algorithm, k.key_size, k.created_at, k.expires_at,
              array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM signatures s
       JOIN keys k ON s.signed_key_id = k.id
       LEFT JOIN user_ids u ON k.id = u.key_id
       WHERE s.signer_key_id = $1
       GROUP BY s.id, k.fingerprint, k.key_id, k.algorithm, k.key_size, k.created_at, k.expires_at
       ORDER BY s.signed_at DESC NULLS LAST`,
      [signerKeyId.toUpperCase()]
    );
    return result.rows;
  }

  static async getWebOfTrust(fingerprint, depth = 2) {
    const key = await this.findByFingerprint(fingerprint);
    if (!key) return null;

    const result = {
      key: {
        id: key.id,
        fingerprint: key.fingerprint,
        keyId: key.key_id,
        userIds: key.user_ids
      },
      signatures: [],
      signed: [],
      depth
    };

    const signatures = await this.getSignatures(key.id);
    result.signatures = signatures.map(sig => ({
      signerKeyId: sig.signer_key_id,
      signerFingerprint: sig.signer_fingerprint,
      signerUserIds: sig.signer_user_ids,
      signatureType: sig.signature_type,
      signedAt: sig.signed_at,
      inDb: !!sig.signer_fingerprint
    }));

    const signed = await this.getSignedBy(key.key_id);
    result.signed = signed.map(sig => ({
      keyId: sig.key_id,
      fingerprint: sig.fingerprint,
      algorithm: sig.algorithm,
      keySize: sig.key_size,
      userIds: sig.user_ids,
      signedAt: sig.signed_at
    }));

    return result;
  }

  static async findByEmail(email) {
    const normalizedEmail = email.toLowerCase();
    const result = await pool.query(
      `SELECT DISTINCT k.*, array_agg(json_build_object('name', u.name, 'email', u.email, 'comment', u.comment)) as user_ids
       FROM keys k
       JOIN user_ids u ON k.id = u.key_id
       WHERE LOWER(u.email) = $1
       GROUP BY k.id
       ORDER BY k.created_at DESC
       LIMIT 1`,
      [normalizedEmail]
    );
    return result.rows[0] || null;
  }
}

module.exports = Key;
