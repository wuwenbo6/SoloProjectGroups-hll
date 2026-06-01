import express, { type Request, type Response } from 'express';
import { WebSocket } from 'ws';
import { TWTSimulator } from '../services/TWTSimulator.js';
import type {
  SimulationState,
  SimulationConfig,
  STA,
  ApiResponse,
  NegotiationLog,
  TWTParams,
} from '../../shared/types.js';

const router = express.Router();

const twtSimulator = new TWTSimulator();

let wsConnections: Set<WebSocket> = new Set();

twtSimulator.setOnUpdateCallback((state: SimulationState) => {
  const message = JSON.stringify({ type: 'state', data: state });
  for (const ws of wsConnections) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
});

router.get('/state', (req: Request, res: Response) => {
  try {
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/start', (req: Request, res: Response) => {
  try {
    const started = twtSimulator.start();
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: started ? 'Simulation started' : 'Simulation already running',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/pause', (req: Request, res: Response) => {
  try {
    const paused = twtSimulator.pause();
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: paused ? 'Simulation paused' : 'Simulation not running',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/reset', (req: Request, res: Response) => {
  try {
    twtSimulator.reset();
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: 'Simulation reset',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/config', (req: Request, res: Response) => {
  try {
    const config = req.body as Partial<SimulationConfig>;
    twtSimulator.configure(config);
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: 'Configuration updated',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/speed', (req: Request, res: Response) => {
  try {
    const { speed } = req.body as { speed: number };
    twtSimulator.setSpeed(speed);
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: 'Speed updated',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/seek', (req: Request, res: Response) => {
  try {
    const { time } = req.body as { time: number };
    twtSimulator.seekTo(time);
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: 'Seek complete',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/negotiate', async (req: Request, res: Response) => {
  try {
    const logs = await twtSimulator.negotiateAll();
    const state = twtSimulator.getState();
    const response: ApiResponse<{ state: SimulationState; logs: NegotiationLog[] }> = {
      success: true,
      data: { state, logs },
      message: 'Negotiation complete',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/stas', (req: Request, res: Response) => {
  try {
    const stas = twtSimulator.getSTAs();
    const response: ApiResponse<STA[]> = {
      success: true,
      data: stas,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/stas', (req: Request, res: Response) => {
  try {
    const { twtParams } = req.body as { twtParams?: Partial<STA['twtParams']> };
    const sta = twtSimulator.addSTA(twtParams);
    const response: ApiResponse<STA> = {
      success: true,
      data: sta,
      message: 'STA added',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/stas/batch', (req: Request, res: Response) => {
  try {
    const { count } = req.body as { count?: number };
    const num = count || 1;
    const stas: STA[] = [];
    for (let i = 0; i < num; i++) {
      const sta = twtSimulator.addSTA();
      stas.push(sta);
    }
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: `${num} STAs added`,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.put('/stas/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as Partial<STA>;
    const sta = twtSimulator.updateSTA(id, updates);
    if (!sta) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'STA not found',
      };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<STA> = {
      success: true,
      data: sta,
      message: 'STA updated',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.delete('/stas/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = twtSimulator.removeSTA(id);
    if (!deleted) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'STA not found',
      };
      res.status(404).json(response);
      return;
    }
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: true,
      data: state,
      message: 'STA deleted',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/logs', (req: Request, res: Response) => {
  try {
    const logs = twtSimulator.getNegotiationLogs();
    const response: ApiResponse<NegotiationLog[]> = {
      success: true,
      data: logs,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.post('/groups', (req: Request, res: Response) => {
  try {
    const { name, twtParams, staIds } = req.body as {
      name: string;
      twtParams: TWTParams;
      staIds: string[];
    };
    const group = twtSimulator.createGroup(name, twtParams, staIds);
    const response: ApiResponse<typeof group> = {
      success: true,
      data: group,
      message: 'Group created',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/groups', (req: Request, res: Response) => {
  try {
    const groups = twtSimulator.getGroups();
    const response: ApiResponse<typeof groups> = {
      success: true,
      data: groups,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.delete('/groups/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const removed = twtSimulator.removeGroup(id);
    const state = twtSimulator.getState();
    const response: ApiResponse<SimulationState> = {
      success: removed,
      data: state,
      message: removed ? 'Group removed' : 'Group not found',
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

router.get('/export/curve', (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'json';
    
    if (format === 'csv') {
      const csv = twtSimulator.exportSavingCurveCSV();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=twt_saving_curve.csv');
      res.send(csv);
    } else {
      const json = twtSimulator.exportSavingCurveJSON();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=twt_saving_curve.json');
      res.send(json);
    }
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

export function setupWebSocket(wss: any) {
  wss.on('connection', (ws: WebSocket) => {
    wsConnections.add(ws);
    
    const state = twtSimulator.getState();
    ws.send(JSON.stringify({ type: 'state', data: state }));

    ws.on('close', () => {
      wsConnections.delete(ws);
    });

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.error('Invalid WebSocket message');
      }
    });
  });
}

export function getSimulator(): TWTSimulator {
  return twtSimulator;
}

export default router;
