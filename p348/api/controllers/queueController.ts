import { Request, Response } from 'express';
import { messageQueue } from '../services/queue/MessageQueue';
import { sendCommandToChargePoint, isChargePointConnected } from '../websocket/OCPPWebSocketServer';

export async function getQueueStats(req: Request, res: Response): Promise<void> {
  try {
    const pendingCount = messageQueue.getPendingCount();
    const allPending = messageQueue.getAllPending();

    const byChargePoint = new Map<string, number>();
    for (const msg of allPending) {
      byChargePoint.set(msg.chargePointId, (byChargePoint.get(msg.chargePointId) || 0) + 1);
    }

    res.json({
      pendingCount,
      messages: allPending,
      byChargePoint: Object.fromEntries(byChargePoint)
    });
  } catch (error) {
    console.error('[API] Error getting queue stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
}

export async function getQueueForChargePoint(req: Request, res: Response): Promise<void> {
  try {
    const { chargePointId } = req.params;
    const pendingCount = messageQueue.getPendingCountForChargePoint(chargePointId);
    const messages = messageQueue.getPendingForChargePoint(chargePointId);
    const isConnected = isChargePointConnected(chargePointId);

    res.json({
      chargePointId,
      isConnected,
      pendingCount,
      messages
    });
  } catch (error) {
    console.error('[API] Error getting queue for charge point:', error);
    res.status(500).json({ error: 'Failed to get queue for charge point' });
  }
}

export async function sendCommand(req: Request, res: Response): Promise<void> {
  try {
    const { chargePointId } = req.params;
    const { action, payload } = req.body;

    if (!action || !payload) {
      res.status(400).json({ error: 'action and payload are required' });
      return;
    }

    const result = await sendCommandToChargePoint(chargePointId, action, payload, {
      timeoutMs: 10000,
      enqueueIfOffline: true
    });

    res.json(result);
  } catch (error: any) {
    console.error('[API] Error sending command:', error);
    res.status(500).json({ error: error.message || 'Failed to send command' });
  }
}

export async function remoteStartTransaction(req: Request, res: Response): Promise<void> {
  try {
    const { chargePointId } = req.params;
    const { connectorId = 1, idTag } = req.body;

    if (!idTag) {
      res.status(400).json({ error: 'idTag is required' });
      return;
    }

    const result = await sendCommandToChargePoint(
      chargePointId,
      'RemoteStartTransaction',
      { connectorId, idTag },
      { timeoutMs: 10000, enqueueIfOffline: true }
    );

    res.json(result);
  } catch (error: any) {
    console.error('[API] Error in remoteStartTransaction:', error);
    res.status(500).json({ error: error.message || 'Failed to send remote start command' });
  }
}

export async function remoteStopTransaction(req: Request, res: Response): Promise<void> {
  try {
    const { chargePointId } = req.params;
    const { transactionId } = req.body;

    if (!transactionId) {
      res.status(400).json({ error: 'transactionId is required' });
      return;
    }

    const result = await sendCommandToChargePoint(
      chargePointId,
      'RemoteStopTransaction',
      { transactionId },
      { timeoutMs: 10000, enqueueIfOffline: true }
    );

    res.json(result);
  } catch (error: any) {
    console.error('[API] Error in remoteStopTransaction:', error);
    res.status(500).json({ error: error.message || 'Failed to send remote stop command' });
  }
}
