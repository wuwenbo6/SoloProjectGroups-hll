import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import { upload } from '../middleware/upload';
import { verifyPackage } from '../services/packageService';
import type { VerifyResult } from '../types';

const router = Router();

router.post(
  '/package',
  upload.fields([
    { name: 'package', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
  ]),
  async (req: Request, res: Response<VerifyResult & { success: boolean; error?: string }>) => {
    try {
      const files = req.files as {
        package?: Express.Multer.File[];
        certificate?: Express.Multer.File[];
      };

      if (!files.package) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'Missing package file',
        });
      }

      const packageFile = files.package[0];
      const packageBuffer = await fs.promises.readFile(packageFile.path);

      let certPem: string | undefined;
      if (files.certificate && files.certificate[0]) {
        certPem = await fs.promises.readFile(files.certificate[0].path, 'utf8');
      }

      const aesKey = req.body.aesKey as string;

      const result = verifyPackage(packageBuffer, certPem, aesKey);

      await fs.promises.unlink(packageFile.path);
      if (files.certificate && files.certificate[0]) {
        await fs.promises.unlink(files.certificate[0].path);
      }

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({
        success: false,
        valid: false,
        message: 'Internal server error: ' + (error as Error).message,
      });
    }
  }
);

export default router;
