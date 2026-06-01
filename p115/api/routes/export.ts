import { Router, Request, Response } from 'express';
import { xmlExportService } from '../services/XmlExportService';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'xml';
    const includeDescription = req.query.includeDescription !== 'false';

    const result = xmlExportService.exportToFormat(format as any, { includeDescription });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/xml', (req: Request, res: Response) => {
  try {
    const includeDescription = req.query.includeDescription !== 'false';
    const content = xmlExportService.exportXml(includeDescription);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="modbus_opcua_config_${Date.now()}.xml"`);
    res.send(content);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/csv', (req: Request, res: Response) => {
  try {
    const includeDescription = req.query.includeDescription !== 'false';
    const content = xmlExportService.exportCsv(includeDescription);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="modbus_opcua_config_${Date.now()}.csv"`);
    res.send(content);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/json', (req: Request, res: Response) => {
  try {
    const content = xmlExportService.exportJson();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="modbus_opcua_config_${Date.now()}.json"`);
    res.send(content);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
