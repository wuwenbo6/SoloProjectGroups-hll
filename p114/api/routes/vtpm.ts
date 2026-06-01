import { Router } from 'express';
import { AppDataSource } from '../database';
import { VTPMEntity } from '../entities/VTPM';
import { CertificateEntity } from '../entities/Certificate';
import { OperationLogEntity } from '../entities/OperationLog';
import { swtpmService } from '../services/SwtpmService';
import { v4 as uuidv4 } from 'uuid';
import forge from 'node-forge';

const router = Router();
const vtpmRepository = () => AppDataSource.getRepository(VTPMEntity);
const certificateRepository = () => AppDataSource.getRepository(CertificateEntity);
const logRepository = () => AppDataSource.getRepository(OperationLogEntity);

const parseCertificate = (pem: string) => {
  const cert = forge.pki.certificateFromPem(pem);
  return {
    subject: cert.subject.getField('CN')?.value || '',
    issuer: cert.issuer.getField('CN')?.value || '',
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  };
};

const createLog = async (vtpmId: string, operation: string, status: string, details?: string) => {
  const log = new OperationLogEntity();
  log.id = uuidv4();
  log.vtpmId = vtpmId;
  log.operation = operation;
  log.status = status;
  log.details = details;
  await logRepository().save(log);
};

router.get('/', async (req, res) => {
  try {
    const vtpms = await vtpmRepository().find({
      order: { createdAt: 'DESC' },
    });
    res.json(vtpms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get vTPM list' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await swtpmService.createVTPM(name);

    const vtpm = new VTPMEntity();
    vtpm.id = result.id;
    vtpm.name = name;
    vtpm.status = 'available';
    vtpm.socketPath = result.socketPath;
    vtpm.statePath = result.statePath;
    vtpm.ekCert = result.ekCert;
    vtpm.akCert = result.akCert;

    await vtpmRepository().save(vtpm);

    await swtpmService.persistPCRs(result.id, result.pcrs);

    const ekInfo = parseCertificate(result.ekCert);
    const ekCert = new CertificateEntity();
    ekCert.id = uuidv4();
    ekCert.vtpmId = result.id;
    ekCert.type = 'EK';
    ekCert.subject = ekInfo.subject;
    ekCert.issuer = ekInfo.issuer;
    ekCert.validFrom = ekInfo.validFrom;
    ekCert.validTo = ekInfo.validTo;
    ekCert.pem = result.ekCert;
    await certificateRepository().save(ekCert);

    const akInfo = parseCertificate(result.akCert);
    const akCert = new CertificateEntity();
    akCert.id = uuidv4();
    akCert.vtpmId = result.id;
    akCert.type = 'AK';
    akCert.subject = akInfo.subject;
    akCert.issuer = akInfo.issuer;
    akCert.validFrom = akInfo.validFrom;
    akCert.validTo = akInfo.validTo;
    akCert.pem = result.akCert;
    await certificateRepository().save(akCert);

    await createLog(result.id, 'create', 'success', `vTPM ${name} created with ${result.pcrs.length} PCR registers`);

    res.json(vtpm);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create vTPM' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vtpm = await vtpmRepository().findOneBy({ id: req.params.id });
    if (!vtpm) {
      return res.status(404).json({ error: 'vTPM not found' });
    }
    res.json(vtpm);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get vTPM' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const vtpm = await vtpmRepository().findOneBy({ id: req.params.id });
    if (!vtpm) {
      return res.status(404).json({ error: 'vTPM not found' });
    }

    await swtpmService.deleteVTPM(req.params.id);
    await vtpmRepository().remove(vtpm);
    await createLog(req.params.id, 'delete', 'success', `vTPM ${vtpm.name} deleted`);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vTPM' });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const { vmId } = req.body;
    const vtpm = await vtpmRepository().findOneBy({ id: req.params.id });

    if (!vtpm) {
      return res.status(404).json({ error: 'vTPM not found' });
    }

    if (!vmId) {
      return res.status(400).json({ error: 'vmId is required' });
    }

    const success = await swtpmService.allocateToVM(req.params.id, vmId);

    if (success) {
      await createLog(req.params.id, 'assign', 'success', `Assigned to VM ${vmId}`);
      const updated = await vtpmRepository().findOneBy({ id: req.params.id });
      res.json(updated);
    } else {
      res.status(400).json({ error: 'Failed to assign vTPM' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to assign vTPM' });
  }
});

router.post('/:id/unassign', async (req, res) => {
  try {
    const { reason } = req.body;
    const vtpm = await vtpmRepository().findOneBy({ id: req.params.id });

    if (!vtpm) {
      return res.status(404).json({ error: 'vTPM not found' });
    }

    const success = await swtpmService.deallocateFromVM(req.params.id, reason);

    if (success) {
      await createLog(req.params.id, 'unassign', 'success', 'vTPM unassigned' + (reason ? `: ${reason}` : ''));
      const updated = await vtpmRepository().findOneBy({ id: req.params.id });
      res.json(updated);
    } else {
      res.status(400).json({ error: 'Failed to unassign vTPM' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to unassign vTPM' });
  }
});

router.get('/:id/pcrs', async (req, res) => {
  try {
    const vtpm = await vtpmRepository().findOneBy({ id: req.params.id });
    if (!vtpm) {
      return res.status(404).json({ error: 'vTPM not found' });
    }

    const pcrs = await swtpmService.getPCRRegisters(req.params.id);
    res.json(pcrs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get PCR registers' });
  }
});

router.put('/:id/pcrs/:index', async (req, res) => {
  try {
    const { value } = req.body;
    if (!value) {
      return res.status(400).json({ error: 'PCR value is required' });
    }

    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0 || index > 23) {
      return res.status(400).json({ error: 'Invalid PCR index (0-23)' });
    }

    const pcr = await swtpmService.updatePCRRegister(req.params.id, index, value);

    if (pcr) {
      await createLog(req.params.id, 'pcr_update', 'success', `PCR ${index} updated`);
      res.json(pcr);
    } else {
      res.status(404).json({ error: 'vTPM not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update PCR register' });
  }
});

router.post('/:id/export', async (req, res) => {
  try {
    const state = await swtpmService.exportState(req.params.id);

    if (state) {
      await createLog(req.params.id, 'export', 'success', `Exported state with ${state.pcrs.length} PCR registers`);
      res.json(state);
    } else {
      res.status(404).json({ error: 'vTPM not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to export state' });
  }
});

router.post('/:id/import', async (req, res) => {
  try {
    const { pcrs } = req.body;

    if (!pcrs || !Array.isArray(pcrs)) {
      return res.status(400).json({ error: 'pcrs array is required' });
    }

    const success = await swtpmService.importState({
      vtpmId: req.params.id,
      pcrs
    });

    if (success) {
      await createLog(req.params.id, 'import', 'success', `Imported state with ${pcrs.length} PCR registers`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'vTPM not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to import state' });
  }
});

router.get('/:id/allocations', async (req, res) => {
  try {
    const history = await swtpmService.getAllocationHistory(req.params.id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get allocation history' });
  }
});

router.get('/:id/certificates', async (req, res) => {
  try {
    const certificates = await certificateRepository().find({
      where: { vtpmId: req.params.id },
      order: { type: 'ASC' },
    });
    res.json(certificates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get certificates' });
  }
});

router.get('/:id/keys', async (req, res) => {
  try {
    const keys = await swtpmService.getKeys(req.params.id);
    res.json(keys);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get keys' });
  }
});

router.post('/:id/quote', async (req, res) => {
  try {
    const { pcrSelection, nonce } = req.body;

    const quote = await swtpmService.generateQuote(
      req.params.id,
      pcrSelection || [0, 1, 2, 3, 4, 5, 6, 7],
      nonce
    );

    await createLog(req.params.id, 'attestation_quote', 'success', `Quote generated with ${pcrSelection?.length || 8} PCRs`);

    res.json(quote);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate quote' });
  }
});

router.post('/:id/quote/:quoteId/verify', async (req, res) => {
  try {
    const { expectedNonce, expectedPCRValues } = req.body;

    const result = await swtpmService.verifyQuote(
      req.params.quoteId,
      expectedNonce,
      expectedPCRValues
    );

    await createLog(req.params.id, 'attestation_verify', result.valid ? 'success' : 'failed', result.details);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to verify quote' });
  }
});

router.get('/:id/quotes', async (req, res) => {
  try {
    const quotes = await swtpmService.getQuotes(req.params.id);
    res.json(quotes);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get quotes' });
  }
});

router.get('/:id/log', async (req, res) => {
  try {
    const format = req.query.format as 'json' | 'tcg' || 'json';
    const log = await swtpmService.getEventLog(req.params.id, format);
    res.json(log);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get event log' });
  }
});

router.post('/:id/log/export', async (req, res) => {
  try {
    const exportData = await swtpmService.exportEventLog(req.params.id);

    if (req.query.download === 'true') {
      const jsonData = JSON.stringify(exportData, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="vtpm-${req.params.id}-log-${Date.now()}.json"`);
      res.send(jsonData);
      return;
    }

    res.json(exportData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to export event log' });
  }
});

router.post('/:id/log/event', async (req, res) => {
  try {
    const { eventName, details, pcrIndex, eventType } = req.body;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    const event = await swtpmService.logEvent(
      req.params.id,
      eventName,
      details,
      pcrIndex,
      eventType
    );

    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to log event' });
  }
});

export default router;
