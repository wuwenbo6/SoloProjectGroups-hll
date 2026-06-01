import { Request, Response } from 'express';
import { dependencyResolver } from '../services/dependency.service';

export class DependencyController {
  async getDependencyTree(req: Request, res: Response): Promise<void> {
    try {
      const { pluginId } = req.params;

      const tree = await dependencyResolver.getDependencyTree(pluginId);

      res.json({
        success: true,
        data: tree,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async checkCircular(req: Request, res: Response): Promise<void> {
    try {
      const { pluginId } = req.params;

      const result = await dependencyResolver.checkCircularDependencies(pluginId);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const dependencyController = new DependencyController();
