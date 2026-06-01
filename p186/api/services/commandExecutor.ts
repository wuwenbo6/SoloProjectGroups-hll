import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function executeCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && 'stdout' in error && 'stderr' in error) {
      const err = error as { code: number; stdout: string; stderr: string };
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        exitCode: err.code || 1,
      };
    }
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: 1,
    };
  }
}

export async function getNFS4ACL(path: string): Promise<CommandResult> {
  return executeCommand('nfs4_getfacl', [path]);
}

export async function setNFS4ACL(path: string, aclSpec: string): Promise<CommandResult> {
  return executeCommand('setfacl', ['-m', aclSpec, path]);
}

export async function setNFS4ACLFromFile(path: string, aclFilePath: string): Promise<CommandResult> {
  return executeCommand('setfacl', ['-M', aclFilePath, path]);
}

export async function removeNFS4ACL(path: string): Promise<CommandResult> {
  return executeCommand('setfacl', ['-b', path]);
}

export function isNFS4ToolsAvailable(): Promise<boolean> {
  return executeCommand('which', ['nfs4_getfacl'])
    .then((result) => result.exitCode === 0)
    .catch(() => false);
}
