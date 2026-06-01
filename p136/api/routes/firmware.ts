import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { upload } from '../middleware/upload';
import { parseCertificate } from '../services/certService';
import { parseCertificateChain, buildCertificateChain, verifyCertificateChain } from '../services/certChainService';
import {
  signData,
  encryptData,
  generateRandomKey,
  generateRandomIV,
  isValidAESKey,
  isValidAESIV,
  computeSHA256,
} from '../services/cryptoService';
import {
  createFirmwarePackage,
  savePackage,
  getPackagePath,
  buildMetadataWithVersion,
  createSignLogEntry,
} from '../services/packageService';
import type {
  CertInfo,
  CertChainInfo,
  EncryptConfig,
  SignEncryptResponse,
  VersionInfo,
} from '../types';

const router = Router();

router.post(
  '/sign-encrypt',
  upload.fields([
    { name: 'firmware', maxCount: 1 },
    { name: 'privateKey', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
    { name: 'caCertificates', maxCount: 10 },
  ]),
  async (req: Request, res: Response<SignEncryptResponse>) => {
    const startTime = Date.now();
    try {
      const files = req.files as {
        firmware?: Express.Multer.File[];
        privateKey?: Express.Multer.File[];
        certificate?: Express.Multer.File[];
        caCertificates?: Express.Multer.File[];
      };

      if (!files.firmware || !files.privateKey || !files.certificate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required files: firmware, privateKey, and certificate are required',
        });
      }

      const firmwareFile = files.firmware[0];
      const privateKeyFile = files.privateKey[0];
      const certificateFile = files.certificate[0];

      const firmwareBuffer = await fs.promises.readFile(firmwareFile.path);
      const privateKeyPem = await fs.promises.readFile(privateKeyFile.path, 'utf8');
      const certificatePem = await fs.promises.readFile(certificateFile.path, 'utf8');

      let aesKey = req.body.aesKey as string;
      let aesIv = req.body.aesIv as string;
      const firmwareVersion = req.body.firmwareVersion as string;
      const packageVersion = req.body.packageVersion as string;
      const hardwareVersion = req.body.hardwareVersion as string;
      const changelog = req.body.changelog as string;

      if (!aesKey || !isValidAESKey(aesKey)) {
        aesKey = generateRandomKey();
      }

      if (!aesIv || !isValidAESIV(aesIv)) {
        aesIv = generateRandomIV();
      }

      const encryptConfig: EncryptConfig = { aesKey, aesIv };

      let certInfo: CertInfo;
      try {
        certInfo = parseCertificate(certificatePem);
        certInfo.pem = certificatePem;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid certificate file: ' + (error as Error).message,
        });
      }

      let caCerts: CertInfo[] = [];
      let certChain: CertChainInfo | undefined;
      if (files.caCertificates && files.caCertificates.length > 0) {
        for (const caFile of files.caCertificates) {
          const caPem = await fs.promises.readFile(caFile.path, 'utf8');
          const parsedChain = parseCertificateChain(caPem);
          caCerts = [...caCerts, ...parsedChain];
        }
        
        if (caCerts.length > 0) {
          certChain = buildCertificateChain(certInfo, caCerts);
          certChain.chainValid = verifyCertificateChain(certChain);
        }
      }

      const signResult = signData(firmwareBuffer, privateKeyPem);
      if (!signResult.success) {
        createSignLogEntry(
          firmwareFile.originalname,
          firmwareBuffer.length,
          signResult.hash,
          certInfo,
          signResult.algorithm,
          'AES-128-CBC',
          'failed',
          { errorMessage: 'Failed to sign firmware', durationMs: Date.now() - startTime }
        );
        return res.status(400).json({
          success: false,
          error: 'Failed to sign firmware. Check if private key is valid.',
        });
      }

      const encryptResult = encryptData(firmwareBuffer, encryptConfig);
      if (!encryptResult.success) {
        createSignLogEntry(
          firmwareFile.originalname,
          firmwareBuffer.length,
          signResult.hash,
          certInfo,
          signResult.algorithm,
          'AES-128-CBC',
          'failed',
          { errorMessage: 'Failed to encrypt firmware', durationMs: Date.now() - startTime }
        );
        return res.status(400).json({
          success: false,
          error: 'Failed to encrypt firmware.',
        });
      }

      const customVersion: Partial<VersionInfo> = {};
      if (firmwareVersion) customVersion.firmwareVersion = firmwareVersion;
      if (packageVersion) customVersion.packageVersion = packageVersion;
      if (hardwareVersion) customVersion.hardwareVersion = hardwareVersion;
      if (changelog) customVersion.changelog = changelog;

      const { metadata, versionInfo } = buildMetadataWithVersion(
        firmwareFile.originalname,
        firmwareBuffer.length,
        signResult.hash,
        signResult.algorithm,
        'AES-128-CBC',
        certInfo,
        certChain,
        customVersion
      );

      const encryptedFirmwareBuffer = Buffer.from(encryptResult.encryptedData, 'hex');
      const signatureBuffer = Buffer.from(signResult.signature, 'hex');
      const ivBuffer = Buffer.from(aesIv, 'hex');

      const packageBuffer = createFirmwarePackage(
        encryptedFirmwareBuffer,
        signatureBuffer,
        ivBuffer,
        metadata
      );

      const packageFilename = await savePackage(packageBuffer, firmwareFile.originalname);
      const packageSize = packageBuffer.length;

      const logEntry = createSignLogEntry(
        firmwareFile.originalname,
        firmwareBuffer.length,
        signResult.hash,
        certInfo,
        signResult.algorithm,
        'AES-128-CBC',
        'success',
        {
          signature: signResult.signature,
          packageFilename,
          packageSize,
          versionInfo,
          durationMs: Date.now() - startTime,
        }
      );

      const cleanupPromises = [
        fs.promises.unlink(firmwareFile.path),
        fs.promises.unlink(privateKeyFile.path),
        fs.promises.unlink(certificateFile.path),
      ];
      if (files.caCertificates) {
        for (const caFile of files.caCertificates) {
          cleanupPromises.push(fs.promises.unlink(caFile.path));
        }
      }
      await Promise.all(cleanupPromises);

      res.json({
        success: true,
        data: {
          packageFilename,
          packageSize,
          signResult,
          encryptResult,
          certInfo,
          certChain,
          encryptConfig,
          versionInfo,
          logEntry,
        },
      });
    } catch (error) {
      console.error('Sign/encrypt error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error: ' + (error as Error).message,
      });
    }
  }
);

router.post(
  '/parse-cert',
  upload.single('certificate'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No certificate file provided',
        });
      }

      const certPem = await fs.promises.readFile(req.file.path, 'utf8');
      const certInfo = parseCertificate(certPem);

      await fs.promises.unlink(req.file.path);

      res.json({
        success: true,
        data: certInfo,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid certificate: ' + (error as Error).message,
      });
    }
  }
);

router.post('/generate-key', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      aesKey: generateRandomKey(),
      aesIv: generateRandomIV(),
    },
  });
});

router.post(
  '/upload',
  upload.single('firmware'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No firmware file provided',
        });
      }

      const firmwareBuffer = await fs.promises.readFile(req.file.path);
      const hash = computeSHA256(firmwareBuffer);

      res.json({
        success: true,
        data: {
          filename: req.file.originalname,
          size: firmwareBuffer.length,
          sha256: hash,
          tempPath: req.file.path,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

router.get('/download/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const safeFilename = path.basename(filename);
  const filePath = getPackagePath(safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File not found',
    });
  }

  res.download(filePath, safeFilename, (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to download file',
      });
    }
  });
});

router.delete('/files', async (_req: Request, res: Response) => {
  try {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const outputDir = path.join(process.cwd(), 'output');

    const cleanupDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          await fs.promises.unlink(filePath);
        }
      }
    };

    await Promise.all([cleanupDir(uploadDir), cleanupDir(outputDir)]);

    res.json({
      success: true,
      message: 'All temporary files cleaned up',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
