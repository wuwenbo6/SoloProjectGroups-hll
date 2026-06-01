import { Router, Request, Response } from 'express';
import multer from 'multer';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

declare global {
  namespace Express {
    interface Request {
      file?: MulterFile;
    }
  }
}
import { mappingService } from '../services/MappingService';
import { excelService } from '../services/ExcelService';
import { MappingRule } from '../../shared/types';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件 (.xlsx, .xls, .csv)'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/', (req: Request, res: Response) => {
  try {
    const rules = mappingService.getAllRules();
    res.json({ success: true, data: rules });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/devices', (req: Request, res: Response) => {
  try {
    const devices = mappingService.getDistinctDevices();
    res.json({ success: true, data: devices });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = mappingService.getStats();
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/register-types', (req: Request, res: Response) => {
  try {
    const types = [
      { code: 'Coil', name: '线圈', readOnly: false, defaultDataType: 'Boolean', description: '可读写布尔量，用于控制输出' },
      { code: 'DiscreteInput', name: '离散输入', readOnly: true, defaultDataType: 'Boolean', description: '只读布尔量，用于开关状态采集' },
      { code: 'InputRegister', name: '输入寄存器', readOnly: true, defaultDataType: 'UInt16', description: '只读16位数值，用于传感器数据采集' },
      { code: 'HoldingRegister', name: '保持寄存器', readOnly: false, defaultDataType: 'UInt16', description: '可读写16位数值，用于控制参数存储' },
    ];
    res.json({ success: true, data: types });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/data-types', (req: Request, res: Response) => {
  try {
    const types = [
      { code: 'Boolean', name: '布尔型', compatibleRegisters: ['Coil', 'DiscreteInput'] },
      { code: 'Int16', name: '16位有符号整数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
      { code: 'UInt16', name: '16位无符号整数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
      { code: 'Int32', name: '32位有符号整数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
      { code: 'UInt32', name: '32位无符号整数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
      { code: 'Float', name: '单精度浮点数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
      { code: 'Double', name: '双精度浮点数', compatibleRegisters: ['InputRegister', 'HoldingRegister'] },
    ];
    res.json({ success: true, data: types });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/check-conflict', (req: Request, res: Response) => {
  try {
    const { deviceName, registerType, registerAddress, opcuaNodeId, opcuaBrowseName, excludeId } = req.body;
    
    const conflicts: string[] = [];
    
    if (deviceName && registerType !== undefined && registerAddress !== undefined) {
      if (mappingService.isDeviceRegisterExists(deviceName, registerType, registerAddress, excludeId)) {
        conflicts.push(`设备 ${deviceName} 的 ${registerType} 地址 ${registerAddress} 已存在映射规则`);
      }
    }
    
    if (opcuaNodeId && mappingService.isNodeIdExists(opcuaNodeId, excludeId)) {
      conflicts.push(`OPC UA 节点ID ${opcuaNodeId} 已存在`);
    }
    
    if (opcuaBrowseName && mappingService.isBrowseNameExists(opcuaBrowseName, excludeId)) {
      conflicts.push(`OPC UA 浏览名称 ${opcuaBrowseName} 已存在`);
    }
    
    res.json({ 
      success: true, 
      data: { 
        hasConflict: conflicts.length > 0, 
        conflicts 
      } 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rule = mappingService.getRuleById(id);
    if (!rule) {
      res.status(404).json({ success: false, error: '映射规则不存在' });
      return;
    }
    res.json({ success: true, data: rule });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const rule = req.body as Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>;
    const autoResolveConflict = req.query.autoResolve === 'true';
    
    if (!rule.deviceName || !rule.registerType || !rule.dataType) {
      res.status(400).json({ success: false, error: '缺少必要字段' });
      return;
    }

    const id = mappingService.createRule(rule, autoResolveConflict);
    res.json({ success: true, data: { id } });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rule = req.body as Partial<MappingRule>;
    const autoResolveConflict = req.query.autoResolve === 'true';
    
    const success = mappingService.updateRule(id, rule, autoResolveConflict);
    if (!success) {
      res.status(404).json({ success: false, error: '映射规则不存在' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = mappingService.deleteRule(id);
    if (!success) {
      res.status(404).json({ success: false, error: '映射规则不存在' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/', (req: Request, res: Response) => {
  try {
    const count = mappingService.deleteAllRules();
    res.json({ success: true, data: { deletedCount: count } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '请选择要上传的文件' });
      return;
    }

    const result = excelService.parseBuffer(req.file.buffer);
    
    if (!result.success && result.errors.length > 0) {
      res.json({ success: false, data: result.data, errors: result.errors });
      return;
    }

    res.json({ success: true, data: result.data, errors: result.errors });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/import', (req: Request, res: Response) => {
  try {
    const { rules, replace, autoResolveConflict } = req.body as { 
      rules: Array<Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>>; 
      replace?: boolean;
      autoResolveConflict?: boolean;
    };
    
    if (!rules || rules.length === 0) {
      res.status(400).json({ success: false, error: '没有要导入的数据' });
      return;
    }

    if (replace) {
      mappingService.deleteAllRules();
    }

    const result = mappingService.bulkCreateRules(rules, autoResolveConflict ?? true);
    res.json({ 
      success: true, 
      data: { 
        successCount: result.success,
        failedCount: result.failed,
        totalCount: rules.length,
        messages: result.errors 
      } 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/template/download', (req: Request, res: Response) => {
  try {
    const buffer = excelService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=modbus_mapping_template.xlsx');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
