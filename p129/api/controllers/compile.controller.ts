import type { Request, Response } from 'express';
import { generateIR, applyPasses, getAvailablePasses, checkToolchain } from '../services/llvm.service.js';
import { parseCompileResult } from '../services/ir-parser.service.js';
import { analyzeTiming } from '../services/timing.service.js';
import { exportCFGToDot, exportDFGToDot, generatePassTemplate, generateCMakeLists } from '../services/dot-export.service.js';
import type { CompileRequest, CompileResponse, ControlFlowGraph, DataFlowGraph, PassTemplateResponse } from '@shared/types.js';

export async function compileCode(req: Request, res: Response) {
  try {
    const { code, passes } = req.body as CompileRequest;

    if (!code || code.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Code cannot be empty',
      });
      return;
    }

    const toolchain = await checkToolchain();
    if (!toolchain.clangAvailable) {
      res.status(500).json({
        success: false,
        error: 'Clang compiler not found. Please install Clang/LLVM toolchain.',
      });
      return;
    }

    let originalIR: string;
    try {
      originalIR = await generateIR(code, false);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Compilation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    let optimizedIR = originalIR;
    if (passes && passes.length > 0) {
      try {
        optimizedIR = await applyPasses(originalIR, passes, code);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: `Optimization failed: ${error instanceof Error ? error.message : String(error)}`,
          originalIR,
          optimizedIR: originalIR,
          cfgs: [],
          dfg: { nodes: [], edges: [] },
        });
        return;
      }
    }

    const { cfgs, dfg } = parseCompileResult(originalIR, optimizedIR);
    const timing = dfg.nodes.length > 0 ? analyzeTiming(dfg) : undefined;

    const response: CompileResponse = {
      success: true,
      originalIR,
      optimizedIR,
      cfgs,
      dfg,
      timing,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function exportCFGToDotFile(req: Request, res: Response) {
  try {
    const cfg = req.body as ControlFlowGraph;
    const dotContent = exportCFGToDot(cfg);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${cfg.functionName}_cfg.dot"`);
    res.send(dotContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to export CFG: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function exportDFGToDotFile(req: Request, res: Response) {
  try {
    const dfg = req.body as DataFlowGraph;
    const dotContent = exportDFGToDot(dfg);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="dfg.dot"');
    res.send(dotContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to export DFG: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function generatePassTemplateFile(req: Request, res: Response) {
  try {
    const { passName } = req.params;
    const cppCode = generatePassTemplate(passName);
    const cmakeCode = generateCMakeLists(passName);
    const response: PassTemplateResponse = { cppCode, cmakeCode };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to generate pass template: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export function getPasses(req: Request, res: Response) {
  try {
    const passes = getAvailablePasses();
    res.json({
      success: true,
      passes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get passes: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function getToolchainStatus(req: Request, res: Response) {
  try {
    const status = await checkToolchain();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to check toolchain: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
