import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { OptimizePass } from '@shared/types.js';

const execFileAsync = promisify(execFile);

export const AVAILABLE_PASSES: OptimizePass[] = [
  {
    name: 'mem2reg',
    description: '将内存访问提升为寄存器访问，消除alloca指令',
    category: 'transform',
  },
  {
    name: 'instcombine',
    description: '组合冗余指令，进行代数简化',
    category: 'transform',
  },
  {
    name: 'dce',
    description: '死代码消除，移除无副作用的未使用指令',
    category: 'transform',
  },
  {
    name: 'simplifycfg',
    description: '简化控制流图，合并基本块',
    category: 'transform',
  },
  {
    name: 'adce',
    description: '激进死代码消除',
    category: 'transform',
  },
  {
    name: 'gvn',
    description: '全局值编号，消除冗余计算',
    category: 'transform',
  },
  {
    name: 'licm',
    description: '循环不变代码外提',
    category: 'transform',
  },
  {
    name: 'loop-rotate',
    description: '循环旋转，标准化循环结构',
    category: 'transform',
  },
  {
    name: 'sroa',
    description: '标量聚合替换，拆分结构体alloca',
    category: 'transform',
  },
  {
    name: 'early-cse',
    description: '早期公共子表达式消除',
    category: 'transform',
  },
];

interface ToolPaths {
  clang: string;
  opt: string | null;
}

let cachedToolPaths: ToolPaths | null = null;

async function findTools(): Promise<ToolPaths> {
  if (cachedToolPaths) return cachedToolPaths;

  const possiblePaths = [
    '/usr/bin/clang',
    '/usr/local/bin/clang',
    '/opt/homebrew/opt/llvm/bin/clang',
    '/usr/local/opt/llvm/bin/clang',
  ];

  let clangPath = 'clang';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      clangPath = p;
      break;
    }
  }

  let optPath: string | null = null;
  const optCandidates = [
    '/usr/bin/opt',
    '/usr/local/bin/opt',
    '/opt/homebrew/opt/llvm/bin/opt',
    '/usr/local/opt/llvm/bin/opt',
  ];

  for (const p of optCandidates) {
    if (fs.existsSync(p)) {
      optPath = p;
      break;
    }
  }

  try {
    await execFileAsync('which', ['opt']);
    if (!optPath) optPath = 'opt';
  } catch {
    // opt not in PATH
  }

  cachedToolPaths = { clang: clangPath, opt: optPath };
  return cachedToolPaths;
}

async function createTempFile(content: string, extension: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llvm-'));
  const filePath = path.join(tmpDir, `code.${extension}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function cleanupTempFile(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

export async function generateIR(code: string, optimized: boolean = false): Promise<string> {
  const tools = await findTools();
  const cFile = await createTempFile(code, 'c');

  try {
    const args = ['-S', '-emit-llvm', '-o', '-', cFile];
    if (optimized) {
      args.unshift('-O1');
    } else {
      args.unshift('-O0', '-Xclang', '-disable-O0-optnone');
    }

    const { stdout, stderr } = await execFileAsync(tools.clang, args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return stdout;
  } finally {
    cleanupTempFile(cFile);
  }
}

export async function applyPasses(ir: string, passes: string[], originalCode?: string): Promise<string> {
  const tools = await findTools();

  if (!tools.opt) {
    if (passes.length === 0) return ir;
    if (originalCode && (passes.includes('mem2reg') || passes.includes('instcombine') || passes.includes('dce'))) {
      return generateIRFromCWithOpt(originalCode, passes);
    }
    throw new Error(
      'LLVM opt tool not found. Please install LLVM toolchain for precise pass control.'
    );
  }

  const irFile = await createTempFile(ir, 'll');

  try {
    const passArgs = passes.flatMap((p) => ['--passes', p]);
    const args = [...passArgs, '-S', '-o', '-', irFile];

    const { stdout, stderr } = await execFileAsync(tools.opt, args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return stdout || ir;
  } finally {
    cleanupTempFile(irFile);
  }
}

async function generateIRFromCWithOpt(originalCode: string, passes: string[]): Promise<string> {
  const tools = await findTools();

  let optLevel = '-O0';
  const extraArgs: string[] = [];

  if (passes.length > 0) {
    optLevel = '-O1';
    if (passes.includes('mem2reg')) {
      extraArgs.push('-Xclang', '-disable-O0-optnone');
    }
  }

  const cFile = await createTempFile(originalCode, 'c');

  try {
    const args = [optLevel, ...extraArgs, '-S', '-emit-llvm', '-o', '-', cFile];
    const { stdout, stderr } = await execFileAsync(tools.clang, args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return stdout;
  } finally {
    cleanupTempFile(cFile);
  }
}

export async function checkToolchain(): Promise<{
  clangAvailable: boolean;
  optAvailable: boolean;
  clangVersion?: string;
  optVersion?: string;
}> {
  const tools = await findTools();
  let clangAvailable = false;
  let optAvailable = false;
  let clangVersion: string | undefined;
  let optVersion: string | undefined;

  try {
    const { stdout } = await execFileAsync(tools.clang, ['--version']);
    clangAvailable = true;
    clangVersion = stdout.split('\n')[0];
  } catch {
    clangAvailable = false;
  }

  if (tools.opt) {
    try {
      const { stdout } = await execFileAsync(tools.opt, ['--version']);
      optAvailable = true;
      optVersion = stdout.split('\n')[0];
    } catch {
      optAvailable = false;
    }
  }

  return { clangAvailable, optAvailable, clangVersion, optVersion };
}

export function getAvailablePasses(): OptimizePass[] {
  return AVAILABLE_PASSES;
}
