import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RbdCommandResult {
  stdout: string;
  stderr: string;
}

export async function executeRbdCommand(args: string): Promise<RbdCommandResult> {
  const cmd = `rbd ${args}`;
  console.log(`[RBD] Executing: ${cmd}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    console.error(`[RBD] Command failed: ${cmd}`, error.message);
    throw new Error(error.stderr?.trim() || error.message || 'RBD command execution failed');
  }
}

export function parseJsonOutput(stdout: string): any {
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}
