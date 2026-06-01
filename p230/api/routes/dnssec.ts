import { Router, Request, Response } from 'express';
import { performDNSSECVerification } from '../services/dnssecVerify';
import { VerifyRequest, RecordType, TrustAnchor } from '../../shared/types';
import { getAllAnchors, getAnchorById, addAnchor, removeAnchor, updateAnchor } from '../services/trustAnchors';

const router = Router();

const VALID_RECORD_TYPES: RecordType[] = ['A', 'AAAA', 'NS', 'TXT', 'MX', 'SOA', 'CNAME'];

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { domain, recordType, trustAnchorId } = req.body as Partial<VerifyRequest>;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
      });
    }

    if (!recordType || !VALID_RECORD_TYPES.includes(recordType as RecordType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid record type. Must be one of: ${VALID_RECORD_TYPES.join(', ')}`,
      });
    }

    const trimmedDomain = domain.trim().toLowerCase().replace(/\.$/, '');

    const result = await performDNSSECVerification({
      domain: trimmedDomain,
      recordType: recordType as RecordType,
      trustAnchorId,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get('/trust-anchors', (_req: Request, res: Response) => {
  try {
    const anchors = getAllAnchors();
    res.json({ success: true, anchors });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.post('/trust-anchors', (req: Request, res: Response) => {
  try {
    const { domain, keyTag, algorithm, digestType, digest, description } = req.body;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }
    if (typeof keyTag !== 'number' || keyTag < 0 || keyTag > 65535) {
      return res.status(400).json({ success: false, error: 'Valid keyTag (0-65535) is required' });
    }
    if (typeof algorithm !== 'number' || algorithm < 0 || algorithm > 255) {
      return res.status(400).json({ success: false, error: 'Valid algorithm (0-255) is required' });
    }
    if (typeof digestType !== 'number' || digestType < 0 || digestType > 255) {
      return res.status(400).json({ success: false, error: 'Valid digestType (0-255) is required' });
    }
    if (!digest || typeof digest !== 'string') {
      return res.status(400).json({ success: false, error: 'Digest is required' });
    }
    if (!/^[0-9A-Fa-f]+$/.test(digest)) {
      return res.status(400).json({ success: false, error: 'Digest must be a valid hex string' });
    }

    const anchor = addAnchor({
      domain: domain.trim().toLowerCase().replace(/\.$/, ''),
      keyTag,
      algorithm,
      digestType,
      digest: digest.toUpperCase(),
      description,
    });

    res.json({ success: true, anchor });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.delete('/trust-anchors/:id', (req: Request, res: Response) => {
  try {
    const removed = removeAnchor(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Trust anchor not found' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.put('/trust-anchors/:id', (req: Request, res: Response) => {
  try {
    const { domain, keyTag, algorithm, digestType, digest, description } = req.body;
    const updates: Partial<Omit<TrustAnchor, 'id' | 'createdAt'>> = {};

    if (domain !== undefined) updates.domain = domain.trim().toLowerCase().replace(/\.$/, '');
    if (keyTag !== undefined) updates.keyTag = keyTag;
    if (algorithm !== undefined) updates.algorithm = algorithm;
    if (digestType !== undefined) updates.digestType = digestType;
    if (digest !== undefined) updates.digest = digest.toUpperCase();
    if (description !== undefined) updates.description = description;

    const updated = updateAnchor(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Trust anchor not found' });
    }
    res.json({ success: true, anchor: updated });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
