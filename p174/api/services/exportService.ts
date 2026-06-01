import { executeRbdCommand } from './rbdService.js';
import type { ExportDiffRequest, ExportDiffResult } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

export async function exportDiff(
  pool: string,
  imageName: string,
  options: ExportDiffRequest
): Promise<ExportDiffResult> {
  const startTime = Date.now();
  const { fromSnapshot, toSnapshot, outputPath } = options;

  let sourceSpec = `${pool}/${imageName}`;
  if (fromSnapshot) {
    sourceSpec += `@${fromSnapshot}`;
  }

  let outputFile = outputPath;
  if (!outputFile) {
    const baseName = fromSnapshot
      ? `${fromSnapshot}_${toSnapshot || 'current'}`
      : `full_${imageName}`;
    outputFile = `/tmp/rbd-diff-${baseName}.bin`;
  }

  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let cmd = 'export-diff ';
  if (fromSnapshot && toSnapshot) {
    cmd += `--from-snap ${fromSnapshot} `;
  }
  cmd += `${pool}/${imageName}`;
  if (toSnapshot) {
    cmd += `@${toSnapshot}`;
  }
  cmd += ` ${outputFile}`;

  await executeRbdCommand(cmd);

  const stats = fs.statSync(outputFile);
  const duration = (Date.now() - startTime) / 1000;

  return {
    fromSnapshot,
    toSnapshot,
    outputPath: outputFile,
    size: stats.size,
    duration,
  };
}
