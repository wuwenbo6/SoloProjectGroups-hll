import { Router, type Request, type Response } from 'express';
import { LdapService } from '../services/LdapService.js';
import type { LdapConnectionConfig } from '../../shared/types.js';

const router = Router();

router.post('/connect', async (req: Request, res: Response) => {
  try {
    const config: LdapConnectionConfig = req.body;

    if (!config.host || !config.port || !config.bindDn || !config.bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
      });
    }

    const ldapService = new LdapService(config);
    const result = await ldapService.testConnection();

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

router.get('/schema', async (req: Request, res: Response) => {
  try {
    const { host, port, baseDn, bindDn, bindPassword, useTls } = req.query;

    if (!host || !port || !bindDn || !bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
      });
    }

    const config: LdapConnectionConfig = {
      host: host as string,
      port: parseInt(port as string, 10),
      baseDn: baseDn as string || '',
      bindDn: bindDn as string,
      bindPassword: bindPassword as string,
      useTls: useTls === 'true',
    };

    const ldapService = new LdapService(config);
    const schema = await ldapService.getSchema();

    res.json({
      success: true,
      data: schema,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

router.get('/schema/objectclasses', async (req: Request, res: Response) => {
  try {
    const { host, port, baseDn, bindDn, bindPassword, useTls } = req.query;

    if (!host || !port || !bindDn || !bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
      });
    }

    const config: LdapConnectionConfig = {
      host: host as string,
      port: parseInt(port as string, 10),
      baseDn: baseDn as string || '',
      bindDn: bindDn as string,
      bindPassword: bindPassword as string,
      useTls: useTls === 'true',
    };

    const ldapService = new LdapService(config);
    const objectClasses = await ldapService.getObjectClasses();

    res.json({
      success: true,
      data: objectClasses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

router.get('/schema/attributetypes', async (req: Request, res: Response) => {
  try {
    const { host, port, baseDn, bindDn, bindPassword, useTls } = req.query;

    if (!host || !port || !bindDn || !bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
      });
    }

    const config: LdapConnectionConfig = {
      host: host as string,
      port: parseInt(port as string, 10),
      baseDn: baseDn as string || '',
      bindDn: bindDn as string,
      bindPassword: bindPassword as string,
      useTls: useTls === 'true',
    };

    const ldapService = new LdapService(config);
    const attributeTypes = await ldapService.getAttributeTypes();

    res.json({
      success: true,
      data: attributeTypes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
