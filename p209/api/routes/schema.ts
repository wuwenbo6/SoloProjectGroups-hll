import { Router, type Request, type Response } from 'express';
import { SchemaService } from '../services/SchemaService.js';
import { LdapService } from '../services/LdapService.js';
import type { SchemaGenerateRequest, SchemaDeployRequest, LdapConnectionConfig, ReindexRequest, CompatibilityCheckRequest, ExportSchemaLdifRequest } from '../../shared/types.js';

const router = Router();
const schemaService = new SchemaService();

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const request: SchemaGenerateRequest = req.body;

    if (!request.attributes || request.attributes.length === 0) {
      return res.status(400).json({
        ldifContent: '',
        schemaFileContent: '',
        errors: ['至少需要定义一个属性'],
        warnings: [],
      });
    }

    const existingAttributeNames: string[] = req.body.existingAttributeNames || [];
    const existingObjectClassNames: string[] = req.body.existingObjectClassNames || [];

    const result = schemaService.generateSchema(
      request,
      existingAttributeNames,
      existingObjectClassNames
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ldifContent: '',
      schemaFileContent: '',
      errors: [error instanceof Error ? error.message : '未知错误'],
      warnings: [],
    });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { content, type } = req.body;

    if (!content) {
      return res.status(400).json({
        valid: false,
        errors: ['Schema 内容不能为空'],
        warnings: [],
      });
    }

    const result = schemaService.validateSchemaContent(content, type || 'ldif');

    res.json(result);
  } catch (error) {
    res.status(500).json({
      valid: false,
      errors: [error instanceof Error ? error.message : '未知错误'],
      warnings: [],
    });
  }
});

router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const request: SchemaDeployRequest = req.body;

    if (!request.ldifContent) {
      return res.status(400).json({
        success: false,
        message: 'LDIF 内容不能为空',
        restartRequired: false,
        deployLog: [],
      });
    }

    if (!request.connectionConfig) {
      return res.status(400).json({
        success: false,
        message: '缺少连接配置',
        restartRequired: false,
        deployLog: [],
      });
    }

    const config: LdapConnectionConfig = request.connectionConfig;

    if (!config.host || !config.port || !config.bindDn || !config.bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
        restartRequired: false,
        deployLog: [],
      });
    }

    const validationResult = schemaService.validateSchemaContent(request.ldifContent, 'ldif');
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: 'Schema 验证失败: ' + validationResult.errors.join('; '),
        restartRequired: false,
        deployLog: validationResult.errors,
      });
    }

    const ldapService = new LdapService(config);
    const result = await ldapService.deploySchema(request.ldifContent);

    res.json({
      success: result.success,
      message: result.message,
      restartRequired: request.restartRequired,
      deployLog: result.log,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      restartRequired: false,
      deployLog: [error instanceof Error ? error.message : '未知错误'],
    });
  }
});

router.post('/download', async (req: Request, res: Response) => {
  try {
    const { content, filename, type } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: '内容不能为空',
      });
    }

    const actualFilename = filename || (type === 'ldif' ? 'schema.ldif' : 'custom.schema');
    const contentType = type === 'ldif' ? 'text/plain' : 'text/plain';

    res.setHeader('Content-Disposition', `attachment; filename="${actualFilename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

router.post('/reindex', async (req: Request, res: Response) => {
  try {
    const request: ReindexRequest = req.body;

    if (!request.attributeNames || request.attributeNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: '至少需要指定一个属性名称',
        log: [],
        restartRequired: false,
      });
    }

    if (!request.connectionConfig) {
      return res.status(400).json({
        success: false,
        message: '缺少连接配置',
        log: [],
        restartRequired: false,
      });
    }

    const config: LdapConnectionConfig = request.connectionConfig;

    if (!config.host || !config.port || !config.bindDn || !config.bindPassword) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接参数',
        log: [],
        restartRequired: false,
      });
    }

    const ldapService = new LdapService(config);
    const result = await ldapService.reindex(request.attributeNames, request.databaseDn);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      log: [error instanceof Error ? error.message : '未知错误'],
      restartRequired: false,
    });
  }
});

router.post('/compatibility-check', async (req: Request, res: Response) => {
  try {
    const request: CompatibilityCheckRequest = req.body;

    if (!request.attributes || request.attributes.length === 0) {
      return res.status(400).json({
        compatible: false,
        conflicts: [],
        summary: '至少需要定义一个属性才能进行兼容性检查',
      });
    }

    if (!request.existingAttributeTypes || !request.existingObjectClasses) {
      return res.status(400).json({
        compatible: false,
        conflicts: [],
        summary: '缺少已有的 Schema 数据',
      });
    }

    const result = schemaService.checkCompatibility(request);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      compatible: false,
      conflicts: [],
      summary: error instanceof Error ? error.message : '未知错误',
    });
  }
});

router.post('/export-ldif', async (req: Request, res: Response) => {
  try {
    const request: ExportSchemaLdifRequest = req.body;

    if (!request.attributeTypes && !request.objectClasses) {
      return res.status(400).json({
        success: false,
        message: '至少需要提供 attributeTypes 或 objectClasses',
      });
    }

    const ldifContent = schemaService.exportSchemaAsLdif({
      attributeTypes: request.attributeTypes || [],
      objectClasses: request.objectClasses || [],
      format: request.format || 'add',
    });

    res.json({
      success: true,
      ldifContent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
