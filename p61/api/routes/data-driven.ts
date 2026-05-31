import express from 'express';
import csvParserService from '../services/CSVParserService.ts';
import parallelExecutionService from '../services/ParallelExecutionService.ts';
import { TestDataRow, ActionStep } from '../../shared/types.ts';

const router = express.Router();

router.post('/parse-csv', (req, res) => {
  try {
    const { csvContent } = req.body;
    const data = csvParserService.parseCSV(csvContent);
    res.json({ data });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/generate-csv', (req, res) => {
  try {
    const { headers, data } = req.body as { headers: string[]; data: TestDataRow[] };
    const csv = csvParserService.generateCSV(headers, data);
    res.json({ csv });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const {
      url,
      steps,
      testData,
      parallel,
      maxConcurrency,
    }: {
      url: string;
      steps: ActionStep[];
      testData: TestDataRow[];
      parallel?: boolean;
      maxConcurrency?: number;
    } = req.body;

    if (!url || !steps) {
      res.status(400).json({ error: 'URL and steps are required' });
      return;
    }

    const result = await parallelExecutionService.execute(
      url,
      steps,
      testData || [],
      parallel || false,
      maxConcurrency || 3
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-script', async (req, res) => {
  try {
    const {
      url,
      steps,
      testData,
      language,
    }: {
      url: string;
      steps: ActionStep[];
      testData: TestDataRow[];
      language: 'python' | 'javascript';
    } = req.body;

    if (!url || !steps || !language) {
      res.status(400).json({ error: 'URL, steps and language are required' });
      return;
    }

    const script = await parallelExecutionService.generateDataDrivenScript(
      url,
      steps,
      testData || [],
      language
    );

    res.json({ script });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/extract-variables', (req, res) => {
  try {
    const { steps } = req.body as { steps: ActionStep[] };
    const variables = csvParserService.extractVariablesFromSteps(steps || []);
    res.json({ variables });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
