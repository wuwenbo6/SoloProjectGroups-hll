import { v4 as uuidv4 } from 'uuid';
import forge from 'node-forge';
import { AppDataSource } from '../database';
import { VTPMEntity } from '../entities/VTPM';
import { PCREntity } from '../entities/PCR';
import { VTPMAllocationEntity } from '../entities/VTPMAllocation';
import { TPMKeyEntity } from '../entities/TPMKey';
import { AttestationQuoteEntity } from '../entities/AttestationQuote';
import { TPMEventLogEntity } from '../entities/TPMEventLog';
import type { PCRRegister, VTPMStatus } from '../../shared/types';

const PCR_DESCRIPTIONS: Record<number, string> = {
  0: 'BIOS Code',
  1: 'BIOS Configuration',
  2: 'Platform Code',
  3: 'Platform Configuration',
  4: 'Boot Device',
  5: 'Boot Configuration',
  6: 'State Transition',
  7: 'Platform Manufacturer',
  8: 'Static OS Code',
  9: 'Static OS Configuration',
  10: 'Dynamic OS Code',
  11: 'Dynamic OS Configuration',
  12: 'Application Code',
  13: 'Application Configuration',
  14: 'Debug',
  15: 'Dynamic OS Loader',
  16: 'Reserved',
  17: 'Reserved',
  18: 'Reserved',
  19: 'Reserved',
  20: 'Reserved',
  21: 'Reserved',
  22: 'Reserved',
  23: 'Application Support'
};

export class SwtpmService {
  private generateRandomHash(algorithm: 'SHA1' | 'SHA256'): string {
    const bytes = algorithm === 'SHA1' ? 20 : 32;
    const random = forge.random.getBytesSync(bytes);
    return forge.util.bytesToHex(random);
  }

  private generateDeterministicHash(seed: string, index: number, algorithm: 'SHA1' | 'SHA256'): string {
    const md = algorithm === 'SHA1' ? forge.md.sha1.create() : forge.md.sha256.create();
    md.update(`${seed}-${index}`);
    return md.digest().toHex();
  }

  public async createVTPM(name: string): Promise<{
    id: string;
    socketPath: string;
    statePath: string;
    ekCert: string;
    akCert: string;
    pcrs: PCRRegister[];
  }> {
    const id = uuidv4();
    const ekCert = this.generateCertificate('EK', id);
    const akCert = this.generateCertificate('AK', id);

    const pcrs = this.generateInitialPCRs(id);

    return {
      id,
      socketPath: `/tmp/swtpm-${id}.sock`,
      statePath: `/var/lib/swtpm/${id}`,
      ekCert,
      akCert,
      pcrs
    };
  }

  private generateInitialPCRs(vtpmId: string): PCRRegister[] {
    const pcrs: PCRRegister[] = [];

    for (let i = 0; i < 24; i++) {
      pcrs.push({
        index: i,
        value: this.generateDeterministicHash(vtpmId, i, 'SHA256'),
        algorithm: 'SHA256',
        description: PCR_DESCRIPTIONS[i]
      });
    }

    return pcrs;
  }

  public async persistPCRs(vtpmId: string, pcrs: PCRRegister[]): Promise<void> {
    const pcrRepository = AppDataSource.getRepository(PCREntity);

    for (const pcr of pcrs) {
      const existing = await pcrRepository.findOne({
        where: { vtpmId, index: pcr.index }
      });

      if (existing) {
        existing.value = pcr.value;
        existing.lastUpdatedAt = new Date();
        await pcrRepository.save(existing);
      } else {
        const pcrEntity = pcrRepository.create({
          id: uuidv4(),
          vtpmId,
          index: pcr.index,
          value: pcr.value,
          algorithm: pcr.algorithm,
          description: pcr.description,
          createdAt: new Date(),
          lastUpdatedAt: new Date()
        });
        await pcrRepository.save(pcrEntity);
      }
    }
  }

  public async getPCRRegisters(vtpmId: string): Promise<PCRRegister[]> {
    const pcrRepository = AppDataSource.getRepository(PCREntity);

    let pcrs = await pcrRepository.find({
      where: { vtpmId },
      order: { index: 'ASC' }
    });

    if (pcrs.length === 0) {
      const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
      const vtpm = await vtpmRepository.findOne({ where: { id: vtpmId } });

      if (vtpm) {
        const initialPCRs = this.generateInitialPCRs(vtpmId);
        await this.persistPCRs(vtpmId, initialPCRs);

        pcrs = await pcrRepository.find({
          where: { vtpmId },
          order: { index: 'ASC' }
        });
      }
    }

    return pcrs.map(pcr => ({
      index: pcr.index,
      value: pcr.value,
      algorithm: pcr.algorithm as 'SHA1' | 'SHA256',
      description: pcr.description
    }));
  }

  public async updatePCRRegister(vtpmId: string, index: number, value: string): Promise<PCRRegister | null> {
    const pcrRepository = AppDataSource.getRepository(PCREntity);

    let pcr = await pcrRepository.findOne({
      where: { vtpmId, index }
    });

    if (!pcr) {
      pcr = pcrRepository.create({
        id: uuidv4(),
        vtpmId,
        index,
        value,
        algorithm: 'SHA256',
        description: PCR_DESCRIPTIONS[index],
        createdAt: new Date(),
        lastUpdatedAt: new Date()
      });
    } else {
      pcr.value = value;
      pcr.lastUpdatedAt = new Date();
    }

    await pcrRepository.save(pcr);

    return {
      index: pcr.index,
      value: pcr.value,
      algorithm: pcr.algorithm as 'SHA1' | 'SHA256',
      description: pcr.description
    };
  }

  public async exportState(vtpmId: string): Promise<{
    vtpm: VTPMEntity;
    pcrs: PCRRegister[];
    exportedAt: Date;
  } | null> {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const vtpm = await vtpmRepository.findOne({ where: { id: vtpmId } });

    if (!vtpm) {
      return null;
    }

    const pcrs = await this.getPCRRegisters(vtpmId);

    return {
      vtpm,
      pcrs,
      exportedAt: new Date()
    };
  }

  public async importState(stateData: {
    vtpmId: string;
    pcrs: PCRRegister[];
  }): Promise<boolean> {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const vtpm = await vtpmRepository.findOne({ where: { id: stateData.vtpmId } });

    if (!vtpm) {
      return false;
    }

    if (vtpm.status === 'running') {
      throw new Error('Cannot import state while vTPM is running');
    }

    await this.persistPCRs(stateData.vtpmId, stateData.pcrs);

    vtpm.migrationData = JSON.stringify({
      importedAt: new Date(),
      pcrCount: stateData.pcrs.length
    });
    vtpm.lastMigratedAt = new Date();
    await vtpmRepository.save(vtpm);

    return true;
  }

  public async allocateToVM(vtpmId: string, vmId: string): Promise<boolean> {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const allocationRepository = AppDataSource.getRepository(VTPMAllocationEntity);

    const vtpm = await vtpmRepository.findOne({ where: { id: vtpmId } });
    if (!vtpm) {
      throw new Error('vTPM not found');
    }

    const existingActiveAllocation = await allocationRepository.findOne({
      where: { vtpmId, status: 'allocated' }
    });

    if (existingActiveAllocation) {
      throw new Error(`vTPM is already allocated to VM ${existingActiveAllocation.vmId}`);
    }

    const existingVTPMforVM = await vtpmRepository.findOne({ where: { vmId } });
    if (existingVTPMforVM) {
      throw new Error(`VM ${vmId} already has vTPM ${existingVTPMforVM.id} allocated`);
    }

    vtpm.vmId = vmId;
    vtpm.status = 'assigned';
    await vtpmRepository.save(vtpm);

    const allocation = allocationRepository.create({
      id: uuidv4(),
      vtpmId,
      vmId,
      status: 'allocated',
      allocatedAt: new Date()
    });
    await allocationRepository.save(allocation);

    return true;
  }

  public async deallocateFromVM(vtpmId: string, reason?: string): Promise<boolean> {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const allocationRepository = AppDataSource.getRepository(VTPMAllocationEntity);

    const vtpm = await vtpmRepository.findOne({ where: { id: vtpmId } });
    if (!vtpm) {
      throw new Error('vTPM not found');
    }

    const allocation = await allocationRepository.findOne({
      where: { vtpmId, status: 'allocated' }
    });

    if (allocation) {
      allocation.status = 'released';
      allocation.releasedAt = new Date();
      allocation.reason = reason;
      await allocationRepository.save(allocation);
    }

    vtpm.vmId = undefined;
    vtpm.status = 'ready';
    await vtpmRepository.save(vtpm);

    return true;
  }

  public async getAllocationHistory(vtpmId: string): Promise<VTPMAllocationEntity[]> {
    const allocationRepository = AppDataSource.getRepository(VTPMAllocationEntity);

    return allocationRepository.find({
      where: { vtpmId },
      order: { createdAt: 'DESC' },
      relations: ['vm']
    });
  }

  private generateCertificate(type: 'EK' | 'AK', vtpmId: string): string {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = vtpmId.replace(/-/g, '');
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: `vTPM ${type} - ${vtpmId}` },
      { name: 'organizationName', value: 'vTPM Manager' },
      { name: 'countryName', value: 'CN' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return forge.pki.certificateToPem(cert);
  }

  public async deleteVTPM(vtpmId: string): Promise<boolean> {
    return true;
  }

  public async encrypt(vtpmId: string, data: string, keyType: 'EK' | 'AK' = 'EK'): Promise<string> {
    const cipher = forge.cipher.createCipher('AES-CBC', forge.util.hexToBytes(vtpmId.replace(/-/g, '').slice(0, 32)));
    const iv = forge.random.getBytesSync(16);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(data)));
    cipher.finish();

    const encrypted = cipher.output.getBytes();
    return forge.util.encode64(iv + encrypted);
  }

  public async decrypt(vtpmId: string, encryptedData: string, keyType: 'EK' | 'AK' = 'EK'): Promise<string> {
    const decoded = forge.util.decode64(encryptedData);
    const iv = decoded.slice(0, 16);
    const encrypted = decoded.slice(16);

    const decipher = forge.cipher.createDecipher('AES-CBC', forge.util.hexToBytes(vtpmId.replace(/-/g, '').slice(0, 32)));
    decipher.start({ iv });
    decipher.update(forge.util.createBuffer(encrypted));
    decipher.finish();

    return forge.util.decodeUtf8(decipher.output.getBytes());
  }

  public async sign(vtpmId: string, data: string): Promise<string> {
    const md = forge.md.sha256.create();
    md.update(data);
    const signature = vtpmId + md.digest().toHex();
    return forge.util.encode64(signature);
  }

  public async verify(vtpmId: string, data: string, signature: string): Promise<boolean> {
    try {
      const decoded = forge.util.decode64(signature);
      const md = forge.md.sha256.create();
      md.update(data);
      const expected = vtpmId + md.digest().toHex();
      return decoded === expected;
    } catch {
      return false;
    }
  }

  public async startVTPM(vtpmId: string): Promise<boolean> {
    return true;
  }

  public async stopVTPM(vtpmId: string): Promise<boolean> {
    return true;
  }

  public async persistKey(vtpmId: string, type: 'EK' | 'AK' | 'SRK' | 'Derived', publicKeyPem: string, privateKeyPem?: string, keyHandle?: string): Promise<TPMKeyEntity> {
    const keyRepository = AppDataSource.getRepository(TPMKeyEntity);

    const existing = await keyRepository.findOne({
      where: { vtpmId, type }
    });

    if (existing) {
      existing.publicKeyPem = publicKeyPem;
      existing.privateKeyPem = privateKeyPem;
      existing.keyHandle = keyHandle;
      existing.isPersistent = true;
      return await keyRepository.save(existing);
    }

    const key = keyRepository.create({
      id: uuidv4(),
      vtpmId,
      type,
      publicKeyPem,
      privateKeyPem,
      keyHandle,
      isPersistent: true,
      attributes: JSON.stringify({ allowSign: true, allowDecrypt: true })
    });

    return await keyRepository.save(key);
  }

  public async getKeys(vtpmId: string): Promise<TPMKeyEntity[]> {
    const keyRepository = AppDataSource.getRepository(TPMKeyEntity);

    return keyRepository.find({
      where: { vtpmId },
      order: { type: 'ASC' }
    });
  }

  public async generateQuote(vtpmId: string, pcrSelection: number[] = [0, 1, 2, 3, 4, 5, 6, 7], nonce?: string): Promise<AttestationQuoteEntity> {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const keyRepository = AppDataSource.getRepository(TPMKeyEntity);
    const quoteRepository = AppDataSource.getRepository(AttestationQuoteEntity);
    const eventLogRepository = AppDataSource.getRepository(TPMEventLogEntity);

    const vtpm = await vtpmRepository.findOne({ where: { id: vtpmId } });
    if (!vtpm) {
      throw new Error('vTPM not found');
    }

    let akKey = await keyRepository.findOne({ where: { vtpmId, type: 'AK' } });
    if (!akKey) {
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = vtpmId.replace(/-/g, '');
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

      const attrs = [
        { name: 'commonName', value: `vTPM AK - ${vtpmId}` },
        { name: 'organizationName', value: 'vTPM Manager' },
        { name: 'countryName', value: 'CN' },
      ];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.sign(keys.privateKey, forge.md.sha256.create());

      akKey = await this.persistKey(
        vtpmId,
        'AK',
        forge.pki.publicKeyToPem(keys.publicKey),
        forge.pki.privateKeyToPem(keys.privateKey),
        `0x81000001`
      );
    }

    const pcrs = await this.getPCRRegisters(vtpmId);
    const selectedPCRs = pcrs.filter(p => pcrSelection.includes(p.index));

    const pcrDigestInput = selectedPCRs.map(p => p.value).join('');
    const pcrDigest = forge.md.sha256.create();
    pcrDigest.update(pcrDigestInput);

    const quoteData = {
      magic: 'TPM2_GENERATED_VALUE',
      type: 'TPM2_ST_ATTEST_QUOTE',
      qualifiedSigner: akKey.keyHandle || '0x81000001',
      extraData: nonce || forge.util.bytesToHex(forge.random.getBytesSync(16)),
      clockInfo: {
        clock: Date.now().toString(),
        resetCount: 0,
        restartCount: 0,
        safe: true
      },
      firmwareVersion: '2.0',
      attested: {
        quote: {
          pcrSelect: {
            count: 1,
            pcrSelections: [{
              hash: 'TPM2_ALG_SHA256',
              sizeofSelect: 3,
              pcrSelect: pcrSelection
            }]
          },
          pcrDigest: pcrDigest.digest().toHex()
        }
      }
    };

    const quoteJson = JSON.stringify(quoteData, null, 2);

    const privateKey = forge.pki.privateKeyFromPem(akKey.privateKeyPem!);
    const md = forge.md.sha256.create();
    md.update(quoteJson);
    const signature = privateKey.sign(md);
    const signatureHex = forge.util.bytesToHex(signature);

    const quote = quoteRepository.create({
      id: uuidv4(),
      vtpmId,
      quote: quoteJson,
      signature: signatureHex,
      nonce: nonce || forge.util.bytesToHex(forge.random.getBytesSync(16)),
      pcrSelection: JSON.stringify(pcrSelection),
      pcrValues: JSON.stringify(selectedPCRs),
      signerCertPem: akKey.publicKeyPem,
      hashAlg: 'TPM2_ALG_SHA256',
      sigAlg: 'TPM2_ALG_RSASSA',
      verified: false,
      signerKeyId: akKey.id
    });

    await quoteRepository.save(quote);

    await this.logEvent(vtpmId, 'Quote Generated', {
      pcrSelection,
      quoteId: quote.id
    }, undefined, 'ATTESTATION');

    return quote;
  }

  public async verifyQuote(quoteId: string, expectedNonce?: string, expectedPCRValues?: PCRRegister[]): Promise<{ valid: boolean; details: string }> {
    const quoteRepository = AppDataSource.getRepository(AttestationQuoteEntity);

    const quote = await quoteRepository.findOne({ where: { id: quoteId } });
    if (!quote) {
      return { valid: false, details: 'Quote not found' };
    }

    if (expectedNonce && quote.nonce !== expectedNonce) {
      return { valid: false, details: 'Nonce mismatch' };
    }

    try {
      const publicKey = forge.pki.publicKeyFromPem(quote.signerCertPem!);
      const md = forge.md.sha256.create();
      md.update(quote.quote);

      const signature = forge.util.hexToBytes(quote.signature);
      const valid = publicKey.verify(md.digest().bytes(), signature);

      if (!valid) {
        quote.verificationResult = 'Signature verification failed';
        await quoteRepository.save(quote);
        return { valid: false, details: 'Signature verification failed' };
      }

      if (expectedPCRValues && expectedPCRValues.length > 0) {
        const quotePCRs: PCRRegister[] = JSON.parse(quote.pcrValues || '[]');
        for (const expected of expectedPCRValues) {
          const actual = quotePCRs.find(p => p.index === expected.index);
          if (!actual || actual.value !== expected.value) {
            quote.verificationResult = `PCR ${expected.index} value mismatch`;
            await quoteRepository.save(quote);
            return { valid: false, details: `PCR ${expected.index} value mismatch` };
          }
        }
      }

      quote.verified = true;
      quote.verificationResult = 'Verification successful';
      await quoteRepository.save(quote);

      return { valid: true, details: 'Quote verified successfully' };
    } catch (e: any) {
      quote.verificationResult = `Error: ${e.message}`;
      await quoteRepository.save(quote);
      return { valid: false, details: `Verification error: ${e.message}` };
    }
  }

  public async getQuotes(vtpmId: string): Promise<AttestationQuoteEntity[]> {
    const quoteRepository = AppDataSource.getRepository(AttestationQuoteEntity);

    return quoteRepository.find({
      where: { vtpmId },
      order: { createdAt: 'DESC' }
    });
  }

  public async logEvent(vtpmId: string, eventName: string, details?: any, pcrIndex?: number, eventType: string = 'TPM2_EVENT'): Promise<TPMEventLogEntity> {
    const eventLogRepository = AppDataSource.getRepository(TPMEventLogEntity);

    const lastEvent = await eventLogRepository.findOne({
      where: { vtpmId },
      order: { sequence: 'DESC' }
    });

    const sequence = lastEvent ? lastEvent.sequence + 1 : 0;

    let digest: string | undefined;
    if (pcrIndex !== undefined && details) {
      const md = forge.md.sha256.create();
      md.update(JSON.stringify(details));
      digest = md.digest().toHex();

      const currentPCRs = await this.getPCRRegisters(vtpmId);
      const currentPCR = currentPCRs.find(p => p.index === pcrIndex);
      if (currentPCR) {
        const combined = currentPCR.value + digest;
        const newMD = forge.md.sha256.create();
        newMD.update(combined);
        const newValue = newMD.digest().toHex();
        await this.updatePCRRegister(vtpmId, pcrIndex, newValue);
      }
    }

    const event = eventLogRepository.create({
      id: uuidv4(),
      vtpmId,
      pcrIndex,
      eventType,
      digest,
      digestAlg: 'SHA256',
      eventData: details ? JSON.stringify(details) : undefined,
      eventName,
      sequence,
      details: details ? JSON.stringify(details) : undefined
    });

    return await eventLogRepository.save(event);
  }

  public async getEventLog(vtpmId: string, format: 'json' | 'tcg' = 'json'): Promise<any> {
    const eventLogRepository = AppDataSource.getRepository(TPMEventLogEntity);

    const events = await eventLogRepository.find({
      where: { vtpmId },
      order: { sequence: 'ASC' }
    });

    if (format === 'tcg') {
      return {
        specIdEvent: {
          signature: 'Spec ID Event03',
          platformClass: 0,
          specVersionMinor: 0,
          specVersionMajor: 2,
          specErrata: 0,
          uintnSize: 8,
          numberOfAlgorithms: 1,
          digestSizes: [{ algorithmId: 11, digestSize: 32 }],
          vendorInfoSize: 0
        },
        events: events.map(e => ({
          pcrIndex: e.pcrIndex,
          eventType: e.eventType,
          digests: [{ algorithmId: 11, digest: e.digest }],
          eventSize: e.eventData ? e.eventData.length : 0,
          event: e.eventData
        }))
      };
    }

    return events;
  }

  public async exportEventLog(vtpmId: string): Promise<{
    log: TPMEventLogEntity[];
    exportedAt: Date;
    pcrSnapshot: PCRRegister[];
    summary: {
      totalEvents: number;
      pcr0Events: number;
      attestationEvents: number;
      dateRange: { start: Date | null; end: Date | null };
    }
  }> {
    const log = await this.getEventLog(vtpmId, 'json') as TPMEventLogEntity[];
    const pcrs = await this.getPCRRegisters(vtpmId);

    return {
      log,
      exportedAt: new Date(),
      pcrSnapshot: pcrs,
      summary: {
        totalEvents: log.length,
        pcr0Events: log.filter(e => e.pcrIndex === 0).length,
        attestationEvents: log.filter(e => e.eventType === 'ATTESTATION').length,
        dateRange: {
          start: log.length > 0 ? log[0].createdAt : null,
          end: log.length > 0 ? log[log.length - 1].createdAt : null
        }
      }
    };
  }
}

export const swtpmService = new SwtpmService();
