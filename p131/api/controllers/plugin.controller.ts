import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { pluginService } from '../services/plugin.service';
import { PluginFilter } from '../types';
import { generatePluginsXml, generateRssXml } from '../utils/xml-generator';

export class PluginController {
  async getPlugins(req: Request, res: Response): Promise<void> {
    try {
      const filter: PluginFilter = {
        search: req.query.search as string,
        category: req.query.category as string,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        qgisVersion: req.query.qgisVersion as string,
        deprecated: req.query.deprecated === 'true',
        experimental: req.query.experimental === 'true' ? true : undefined,
        approved: req.query.approved === 'false' ? false : true,
        sortBy: req.query.sortBy as PluginFilter['sortBy'],
        sortOrder: req.query.sortOrder === 'asc' ? 'asc' : 'desc',
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
      };

      const result = await pluginService.getPlugins(filter);

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

  async getPlugin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plugin = await pluginService.getPluginById(id);

      if (!plugin) {
        res.status(404).json({
          success: false,
          error: 'Plugin not found',
        });
        return;
      }

      res.json({
        success: true,
        data: plugin,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getPluginVersions(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plugin = await pluginService.getPluginById(id);

      if (!plugin) {
        res.status(404).json({
          success: false,
          error: 'Plugin not found',
        });
        return;
      }

      res.json({
        success: true,
        data: plugin.versions,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async downloadPlugin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plugin = await pluginService.getPluginById(id);

      if (!plugin || plugin.versions.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Plugin or version not found',
        });
        return;
      }

      const version = req.query.version 
        ? plugin.versions.find(v => v.version === req.query.version)
        : plugin.versions[0];

      if (!version) {
        res.status(404).json({
          success: false,
          error: 'Version not found',
        });
        return;
      }

      const filePath = path.resolve(
        process.env.STORAGE_PATH || './storage',
        'plugins',
        version.filename
      );

      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'File not found',
        });
        return;
      }

      await pluginService.incrementDownloads(id);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${version.filename}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async deletePlugin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const plugin = await pluginService.getPluginById(id);

      if (!plugin) {
        res.status(404).json({
          success: false,
          error: 'Plugin not found',
        });
        return;
      }

      for (const version of plugin.versions) {
        const filePath = path.resolve(
          process.env.STORAGE_PATH || './storage',
          'plugins',
          version.filename
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await pluginService.deletePlugin(id);

      res.json({
        success: true,
        message: 'Plugin deleted successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await pluginService.getCategories();
      res.json({
        success: true,
        data: categories,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getPluginsXml(req: Request, res: Response): Promise<void> {
    try {
      const plugins = await pluginService.getAllPluginsForXml();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const xml = generatePluginsXml(plugins, baseUrl);

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(xml);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getRssXml(req: Request, res: Response): Promise<void> {
    try {
      const plugins = await pluginService.getAllPluginsForXml();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const xml = generateRssXml(plugins, baseUrl);

      res.setHeader('Content-Type', 'application/rss+xml');
      res.send(xml);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const pluginController = new PluginController();
