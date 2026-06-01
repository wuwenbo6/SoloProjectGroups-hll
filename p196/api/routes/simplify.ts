import { Router, type Request, type Response } from 'express';
import { simplify } from '../services/espresso.js';

const router = Router();

interface SimplifyRequestBody {
  variableCount: number;
  inputType: 'truthTable' | 'sumOfProducts';
  truthTable?: number[];
  minterms?: number[];
  dontCare?: number[];
}

router.post('/', (req: Request, res: Response): void => {
  try {
    const { variableCount, inputType, truthTable, minterms, dontCare } =
      req.body as SimplifyRequestBody;

    if (!variableCount || variableCount < 2 || variableCount > 12) {
      res.status(400).json({
        success: false,
        error: '变量数量必须在2-12之间',
      });
      return;
    }

    let finalMinterms: number[] = [];
    let finalDontCare: number[] = [];

    if (inputType === 'truthTable') {
      if (!truthTable || !Array.isArray(truthTable)) {
        res.status(400).json({
          success: false,
          error: '真值表数据无效',
        });
        return;
      }

      const totalRows = Math.pow(2, variableCount);
      if (truthTable.length !== totalRows) {
        res.status(400).json({
          success: false,
          error: `真值表应有${totalRows}行，当前${truthTable.length}行`,
        });
        return;
      }

      for (let i = 0; i < truthTable.length; i++) {
        const val = truthTable[i];
        if (val === 1) {
          finalMinterms.push(i);
        } else if (val === 2) {
          finalDontCare.push(i);
        }
      }
    } else {
      if (!minterms || !Array.isArray(minterms)) {
        res.status(400).json({
          success: false,
          error: '最小项数据无效',
        });
        return;
      }

      finalMinterms = minterms.filter(
        (m: number) => m >= 0 && m < Math.pow(2, variableCount)
      );
      finalDontCare = (dontCare || []).filter(
        (d: number) => d >= 0 && d < Math.pow(2, variableCount)
      );

      const overlap = finalMinterms.filter((m: number) => finalDontCare.includes(m));
      if (overlap.length > 0) {
        res.status(400).json({
          success: false,
          error: `最小项和无关项存在重叠: {${overlap.join(', ')}}`,
        });
        return;
      }
    }

    const result = simplify(finalMinterms, finalDontCare, variableCount);

    res.json({
      success: true,
      expression: result.expression,
      primeImplicants: result.primeImplicants,
      essentialPrimes: result.essentialPrimes,
      steps: result.steps,
    });
  } catch (error) {
    console.error('Simplify error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
});

export default router;
