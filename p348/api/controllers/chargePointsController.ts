import { Request, Response } from 'express';
import { chargePointRepository } from '../services/database/repositories';
import { getConnectedChargePoints } from '../websocket/OCPPWebSocketServer';

export async function getChargePoints(req: Request, res: Response): Promise<void> {
  try {
    const chargePoints = chargePointRepository.findAll();
    const connectedIds = getConnectedChargePoints();

    const result = chargePoints.map(cp => ({
      ...cp,
      isOnline: connectedIds.includes(cp.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('[API] Error getting charge points:', error);
    res.status(500).json({ error: 'Failed to get charge points' });
  }
}

export async function getChargePointById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const chargePoint = chargePointRepository.findById(id);

    if (!chargePoint) {
      res.status(404).json({ error: 'Charge point not found' });
      return;
    }

    const connectedIds = getConnectedChargePoints();
    res.json({
      ...chargePoint,
      isOnline: connectedIds.includes(chargePoint.id)
    });
  } catch (error) {
    console.error('[API] Error getting charge point:', error);
    res.status(500).json({ error: 'Failed to get charge point' });
  }
}
