import { Router, type Request, type Response } from 'express';
import type { GetACLRequest, SetACLRequest, ACE } from '../../shared/types.js';
import {
  getACL,
  setACL,
  addACE,
  updateACE,
  deleteACE,
  clearACL,
} from '../services/aclService.js';
import { isNFS4ToolsAvailable } from '../services/commandExecutor.js';

const router = Router();

router.get('/tools-check', async (req: Request, res: Response): Promise<void> => {
  try {
    const available = await isNFS4ToolsAvailable();
    res.status(200).json({
      success: true,
      data: {
        available,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query as unknown as GetACLRequest;

    if (!path || typeof path !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Path parameter is required',
      });
      return;
    }

    const result = await getACL(path);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, aces } = req.body as SetACLRequest;

    if (!path || typeof path !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Path is required',
      });
      return;
    }

    if (!Array.isArray(aces)) {
      res.status(400).json({
        success: false,
        error: 'ACEs must be an array',
      });
      return;
    }

    const result = await setACL(path, aces);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

router.post('/add', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, newACE, existingACEs } = req.body as {
      path: string;
      newACE: ACE;
      existingACEs: ACE[];
    };

    if (!path || !newACE || !existingACEs) {
      res.status(400).json({
        success: false,
        error: 'Path, newACE, and existingACEs are required',
      });
      return;
    }

    const result = await addACE(path, newACE, existingACEs);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

router.post('/update', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, index, updatedACE, existingACEs } = req.body as {
      path: string;
      index: number;
      updatedACE: ACE;
      existingACEs: ACE[];
    };

    if (!path || index === undefined || !updatedACE || !existingACEs) {
      res.status(400).json({
        success: false,
        error: 'Path, index, updatedACE, and existingACEs are required',
      });
      return;
    }

    const result = await updateACE(path, index, updatedACE, existingACEs);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

router.post('/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, index, existingACEs } = req.body as {
      path: string;
      index: number;
      existingACEs: ACE[];
    };

    if (!path || index === undefined || !existingACEs) {
      res.status(400).json({
        success: false,
        error: 'Path, index, and existingACEs are required',
      });
      return;
    }

    const result = await deleteACE(path, index, existingACEs);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

router.post('/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.body as { path: string };

    if (!path) {
      res.status(400).json({
        success: false,
        error: 'Path is required',
      });
      return;
    }

    const result = await clearACL(path);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
