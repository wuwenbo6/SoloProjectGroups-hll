import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { parseKconfig } from '../kconfig/parser.js';
import { generateConfig, checkDependencies, resolveDependencies } from '../kconfig/generator.js';
import { parseDotConfig } from '../kconfig/dotConfigParser.js';
import { sampleKconfig } from '../kconfig/sample.js';
import { compareConfigs } from '../kconfig/diff.js';
import { generateMinimalConfig } from '../kconfig/minimalConfig.js';
import type { ConfigValue, KconfigSymbol, DiffResult, MinimalConfigResult } from '../../shared/types.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/parse', upload.single('file'), (req: Request, res: Response): void => {
  try {
    let content: string;

    if (req.file) {
      content = req.file.buffer.toString('utf-8');
    } else if (req.body.content) {
      content = req.body.content;
    } else {
      res.status(400).json({ error: 'No file or content provided' });
      return;
    }

    const result = parseKconfig(content);
    res.json(result);
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: 'Failed to parse Kconfig file' });
  }
});

router.get('/sample', (_req: Request, res: Response): void => {
  try {
    const result = parseKconfig(sampleKconfig);
    res.json(result);
  } catch (error) {
    console.error('Sample parse error:', error);
    res.status(500).json({ error: 'Failed to parse sample Kconfig' });
  }
});

router.post('/generate', (req: Request, res: Response): void => {
  try {
    const { values, symbols } = req.body as {
      values: ConfigValue;
      symbols: Record<string, any>;
    };

    if (!values || !symbols) {
      res.status(400).json({ error: 'Missing values or symbols' });
      return;
    }

    const config = generateConfig(values, symbols);
    res.json({ config });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to generate .config' });
  }
});

router.post('/validate', (req: Request, res: Response): void => {
  try {
    const { symbol, values, symbols } = req.body as {
      symbol: string;
      values: ConfigValue;
      symbols: Record<string, any>;
    };

    if (!symbol || !values || !symbols) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = checkDependencies(symbol, values, symbols);
    res.json(result);
  } catch (error) {
    console.error('Validate error:', error);
    res.status(500).json({ error: 'Failed to validate dependencies' });
  }
});

router.post('/resolve', (req: Request, res: Response): void => {
  try {
    const { symbol, value, values, symbols } = req.body as {
      symbol: string;
      value: string | boolean;
      values: ConfigValue;
      symbols: Record<string, any>;
    };

    if (!symbol || value === undefined || !values || !symbols) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const resolvedValues = resolveDependencies(symbol, value, values, symbols);
    res.json({ values: resolvedValues });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve dependencies' });
  }
});

router.post('/parse-dotconfig', (req: Request, res: Response): void => {
  try {
    const { content } = req.body as { content?: string };
    if (!content) {
      res.status(400).json({ error: 'No content provided' });
      return;
    }
    const values = parseDotConfig(content);
    res.json({ values });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/compare-configs', (req: Request, res: Response): void => {
  try {
    const { current, reference } = req.body as {
      current?: ConfigValue;
      reference?: ConfigValue;
    };
    if (!current || !reference) {
      res.status(400).json({ error: 'Both current and reference configs required' });
      return;
    }
    const result = compareConfigs(current, reference);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/minimal-config', (req: Request, res: Response): void => {
  try {
    const { values, symbols } = req.body as {
      values?: ConfigValue;
      symbols?: Record<string, KconfigSymbol>;
    };
    if (!values || !symbols) {
      res.status(400).json({ error: 'Values and symbols required' });
      return;
    }
    const result = generateMinimalConfig(values, symbols);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
