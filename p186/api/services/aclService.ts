import type { ACE, GetACLResponse, SetACLResponse } from '../../shared/types.js';
import { getNFS4ACL, setNFS4ACL, removeNFS4ACL } from './commandExecutor.js';
import { parseNFS4ACL, serializeACLsToCommand, validateACE } from '../utils/aclParser.js';

export async function getACL(path: string): Promise<GetACLResponse> {
  try {
    if (!path || path.trim() === '') {
      return {
        success: false,
        error: 'Path is required',
      };
    }

    const result = await getNFS4ACL(path);

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr || `Failed to get ACL for path: ${path}`,
      };
    }

    const aces = parseNFS4ACL(result.stdout);

    return {
      success: true,
      data: {
        path,
        aces,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function setACL(path: string, aces: ACE[]): Promise<SetACLResponse> {
  try {
    if (!path || path.trim() === '') {
      return {
        success: false,
        error: 'Path is required',
      };
    }

    if (!Array.isArray(aces) || aces.length === 0) {
      return {
        success: false,
        error: 'At least one ACE is required',
      };
    }

    for (let i = 0; i < aces.length; i++) {
      const ace = aces[i];
      if (!validateACE(ace)) {
        return {
          success: false,
          error: `Invalid ACE at index ${i}: Missing required fields`,
        };
      }
    }

    const aclSpec = serializeACLsToCommand(aces);
    const result = await setNFS4ACL(path, aclSpec);

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr || `Failed to set ACL for path: ${path}`,
      };
    }

    return {
      success: true,
      message: `ACL successfully applied to ${path}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function addACE(path: string, newACE: ACE, existingACEs: ACE[]): Promise<SetACLResponse> {
  const updatedACEs = [...existingACEs, newACE];
  return setACL(path, updatedACEs);
}

export async function updateACE(
  path: string,
  index: number,
  updatedACE: ACE,
  existingACEs: ACE[]
): Promise<SetACLResponse> {
  if (index < 0 || index >= existingACEs.length) {
    return {
      success: false,
      error: `Invalid ACE index: ${index}`,
    };
  }

  const updatedACEs = [...existingACEs];
  updatedACEs[index] = updatedACE;
  return setACL(path, updatedACEs);
}

export async function deleteACE(
  path: string,
  index: number,
  existingACEs: ACE[]
): Promise<SetACLResponse> {
  if (index < 0 || index >= existingACEs.length) {
    return {
      success: false,
      error: `Invalid ACE index: ${index}`,
    };
  }

  const updatedACEs = existingACEs.filter((_, i) => i !== index);
  return setACL(path, updatedACEs);
}

export async function clearACL(path: string): Promise<SetACLResponse> {
  try {
    if (!path || path.trim() === '') {
      return {
        success: false,
        error: 'Path is required',
      };
    }

    const result = await removeNFS4ACL(path);

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr || `Failed to clear ACL for path: ${path}`,
      };
    }

    return {
      success: true,
      message: `ACL successfully cleared for ${path}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
