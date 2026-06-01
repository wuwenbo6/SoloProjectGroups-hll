import { Router, type Request, type Response } from 'express';
import { multiOutputSimplify } from '../services/espresso.js';
import type { MultiOutputRequest } from '../services/espresso.js';

const router = Router();

router.post('/', (req: Request, res: Response): void => {
  try {
    const { variableCount, outputs, shareTerms } =
      req.body as MultiOutputRequest;

    if (!variableCount || variableCount < 2 || variableCount > 12) {
      res.status(400).json({
        success: false,
        error: '变量数量必须在2-12之间',
      });
      return;
    }

    if (!outputs || !Array.isArray(outputs) || outputs.length < 2) {
      res.status(400).json({
        success: false,
        error: '至少需要2个输出函数',
      });
      return;
    }

    const maxMinterm = Math.pow(2, variableCount);
    const outputNames = new Set<string>();

    for (const output of outputs) {
      if (!output.name || typeof output.name !== 'string' || output.name.trim() === '') {
        res.status(400).json({
          success: false,
          error: '每个输出函数必须有有效的名称',
        });
        return;
      }

      if (outputNames.has(output.name)) {
        res.status(400).json({
          success: false,
          error: `输出函数名称重复: ${output.name}`,
        });
        return;
      }
      outputNames.add(output.name);

      if (!output.minterms || !Array.isArray(output.minterms)) {
        res.status(400).json({
          success: false,
          error: `输出函数 ${output.name} 的最小项数据无效`,
        });
        return;
      }

      const validMinterms = output.minterms.filter(
        (m: number) => m >= 0 && m < maxMinterm
      );
      if (validMinterms.length !== output.minterms.length) {
        res.status(400).json({
          success: false,
          error: `输出函数 ${output.name} 包含无效的最小项 (必须在 0-${maxMinterm - 1} 之间)`,
        });
        return;
      }

      const dontCare = output.dontCare || [];
      if (!Array.isArray(dontCare)) {
        res.status(400).json({
          success: false,
          error: `输出函数 ${output.name} 的无关项数据无效`,
        });
        return;
      }

      const validDontCare = dontCare.filter(
        (d: number) => d >= 0 && d < maxMinterm
      );
      if (validDontCare.length !== dontCare.length) {
        res.status(400).json({
          success: false,
          error: `输出函数 ${output.name} 包含无效的无关项 (必须在 0-${maxMinterm - 1} 之间)`,
        });
        return;
      }

      const overlap = validMinterms.filter((m: number) => validDontCare.includes(m));
      if (overlap.length > 0) {
        res.status(400).json({
          success: false,
          error: `输出函数 ${output.name} 的最小项和无关项存在重叠: {${overlap.join(', ')}}`,
        });
        return;
      }
    }

    const result = multiOutputSimplify(variableCount, outputs, shareTerms ?? false);

    res.json(result);
  } catch (error) {
    console.error('Multi-output simplify error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
});

export default router;
