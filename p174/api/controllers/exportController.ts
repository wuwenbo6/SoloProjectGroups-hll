import { Request, Response } from 'express';
import { exportDiff } from '../services/exportService.js';
import type { ExportDiffRequest, ApiResponse } from '../types.js';

export async function handleExportDiff(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name } = req.params;
    const { fromSnapshot, toSnapshot, outputPath } = req.body as ExportDiffRequest;

    const result = await exportDiff(pool, name, { fromSnapshot, toSnapshot, outputPath });

    res.status(200).json({
      success: true,
      data: result,
      message: `Export diff completed successfully, ${result.size} bytes`,
    } as ApiResponse<typeof result>);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
