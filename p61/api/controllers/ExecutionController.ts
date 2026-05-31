import { Request, Response } from 'express';
import seleniumService from '../services/SeleniumService.ts';
import { ScriptLanguage } from '../../shared/types.ts';

export class ExecutionController {
  async execute(req: Request, res: Response) {
    try {
      const { url, steps } = req.body;
      
      if (!url || !steps) {
        res.status(400).json({ error: 'URL and steps are required' });
        return;
      }

      const result = await seleniumService.executeSteps(url, steps);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async generateScript(req: Request, res: Response) {
    try {
      const { url, steps, language } = req.body as {
        url: string;
        steps: any[];
        language: ScriptLanguage;
      };
      
      if (!url || !steps || !language) {
        res.status(400).json({ error: 'URL, steps and language are required' });
        return;
      }

      let script: string;
      if (language === 'python') {
        script = await seleniumService.generatePythonScript(url, steps);
      } else {
        script = await seleniumService.generateJavaScriptScript(url, steps);
      }

      res.json({ script });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new ExecutionController();
