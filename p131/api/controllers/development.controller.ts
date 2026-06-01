import { Request, Response } from 'express';
import { developmentService } from '../services/development.service';

export class DevelopmentController {
  async getDrafts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const drafts = await developmentService.getDrafts(userId);
      res.json({ success: true, data: drafts });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async createDraft(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { metadata } = req.body;
      if (!metadata || !metadata.name || !metadata.version || !metadata.description || !metadata.author || !metadata.qgisMinimumVersion) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: name, version, description, author, qgisMinimumVersion',
        });
        return;
      }

      const plugin = await developmentService.createDraft(userId, metadata);
      res.json({
        success: true,
        data: plugin,
        message: 'Draft created successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async updateDraft(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { metadata } = req.body;

      const plugin = await developmentService.updateDraft(id, metadata);
      res.json({
        success: true,
        data: plugin,
        message: 'Draft updated successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async publishDraft(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plugin = await developmentService.publishDraft(id);
      res.json({
        success: true,
        data: plugin,
        message: 'Plugin published successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async rollbackVersion(req: Request, res: Response): Promise<void> {
    try {
      const { pluginId, versionId } = req.params;
      const result = await developmentService.rollbackVersion(pluginId, versionId);
      res.json({
        success: result.success,
        data: result,
        message: result.message,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async exportDependencyGraph(req: Request, res: Response): Promise<void> {
    try {
      const { pluginId } = req.params;
      const { format = 'json' } = req.query as { format: 'json' | 'dot' | 'mermaid' };

      const result = await developmentService.exportDependencyGraph(pluginId, format);

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async previewDependencyGraph(req: Request, res: Response): Promise<void> {
    try {
      const { pluginId } = req.params;
      const { format = 'mermaid' } = req.query as { format: 'json' | 'dot' | 'mermaid' };

      const result = await developmentService.exportDependencyGraph(pluginId, format);

      res.json({
        success: true,
        data: {
          format: result.format,
          content: result.content,
          filename: result.filename,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const developmentController = new DevelopmentController();
