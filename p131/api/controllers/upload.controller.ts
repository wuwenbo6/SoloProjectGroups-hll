import { Request, Response } from 'express';
import { uploadService, upload } from '../services/upload.service';

export class UploadController {
  async uploadPlugin(req: Request, res: Response): Promise<void> {
    upload.single('plugin')(req, res, async (err) => {
      if (err) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
        return;
      }

      try {
        const userId = req.user?.userId;
        const result = await uploadService.processUpload(
          req.file.path,
          req.file.originalname,
          userId
        );

        res.json({
          success: true,
          data: result,
          message: 'Plugin uploaded successfully',
        });
      } catch (err) {
        res.status(400).json({
          success: false,
          error: (err as Error).message,
        });
      }
    });
  }

  async validatePlugin(req: Request, res: Response): Promise<void> {
    upload.single('plugin')(req, res, async (err) => {
      if (err) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
        return;
      }

      const result = uploadService.validatePlugin(req.file.path);
      res.json(result);
    });
  }
}

export const uploadController = new UploadController();
