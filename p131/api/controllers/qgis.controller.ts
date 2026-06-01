import { Request, Response } from 'express';
import { qgisService } from '../services/qgis.service';

export class QgisController {
  async getServers(_req: Request, res: Response): Promise<void> {
    try {
      const servers = await qgisService.getServers();
      res.json({
        success: true,
        data: servers,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async addServer(req: Request, res: Response): Promise<void> {
    try {
      const { name, url, apiKey } = req.body;

      if (!name || !url || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'Name, URL, and API key are required',
        });
        return;
      }

      const server = await qgisService.addServer({ name, url, apiKey });
      
      res.json({
        success: true,
        data: server,
        message: 'Server added successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async updateServer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, url, apiKey } = req.body;

      const server = await qgisService.updateServer(id, { name, url, apiKey });
      
      res.json({
        success: true,
        data: server,
        message: 'Server updated successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async deleteServer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await qgisService.deleteServer(id);
      
      res.json({
        success: true,
        message: 'Server deleted successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async checkServerStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const isOnline = await qgisService.checkServerStatus(id);
      
      res.json({
        success: true,
        data: {
          serverId: id,
          status: isOnline ? 'online' : 'offline',
          isOnline,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getInstalledPlugins(req: Request, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const result = await qgisService.getInstalledPlugins(serverId);
      
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

  async installPlugin(req: Request, res: Response): Promise<void> {
    try {
      const { serverId, pluginId } = req.params;
      const { version } = req.body;

      if (!version) {
        res.status(400).json({
          success: false,
          error: 'Version is required',
        });
        return;
      }

      const result = await qgisService.installPlugin(serverId, pluginId, version);
      
      res.json({
        success: result.success,
        data: result,
        message: result.success 
          ? `Plugin ${result.plugin} ${result.version} installed successfully` 
          : result.error,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async uninstallPlugin(req: Request, res: Response): Promise<void> {
    try {
      const { serverId, pluginId } = req.params;
      const result = await qgisService.uninstallPlugin(serverId, pluginId);
      
      res.json({
        success: result.success,
        data: result,
        message: result.success 
          ? `Plugin ${result.plugin} uninstalled successfully` 
          : result.error,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
  async activatePlugin(req: Request, res: Response): Promise<void> {
    try {
      const { serverId, pluginId } = req.params;
      const result = await qgisService.activatePlugin(serverId, pluginId);
      
      res.json({
        success: result.success,
        data: result,
        message: result.success 
          ? `Plugin ${result.plugin} activated successfully` 
          : result.error,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const qgisController = new QgisController();
