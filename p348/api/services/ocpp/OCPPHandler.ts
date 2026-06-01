import {
  BootNotificationRequest,
  BootNotificationResponse,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionRequest,
  StopTransactionResponse,
  HeartbeatResponse,
  OCPPAction
} from '../../../shared/types';
import { chargePointRepository, transactionRepository } from '../database/repositories';
import { billingService } from '../billing/BillingService';

const HEARTBEAT_INTERVAL = 300;

export class OCPPHandler {
  async handleBootNotification(
    chargePointId: string,
    payload: BootNotificationRequest
  ): Promise<BootNotificationResponse> {
    console.log(`[OCPP] BootNotification from ${chargePointId}`, payload);

    chargePointRepository.upsert(chargePointId, {
      chargePointVendor: payload.chargePointVendor,
      chargePointModel: payload.chargePointModel,
      chargePointSerialNumber: payload.chargePointSerialNumber,
      firmwareVersion: payload.firmwareVersion,
      status: 'available'
    });

    return {
      status: 'Accepted',
      currentTime: new Date().toISOString(),
      interval: HEARTBEAT_INTERVAL
    };
  }

  async handleStartTransaction(
    chargePointId: string,
    payload: StartTransactionRequest
  ): Promise<StartTransactionResponse> {
    console.log(`[OCPP] StartTransaction from ${chargePointId}`, payload);

    if (payload.meterStart < 0) {
      console.warn(`[OCPP] StartTransaction rejected: meterStart=${payload.meterStart} is negative`);
      return {
        idTagInfo: { status: 'Rejected' },
        transactionId: 0
      };
    }

    const chargePoint = chargePointRepository.findById(chargePointId);
    if (!chargePoint) {
      return {
        idTagInfo: { status: 'Rejected' },
        transactionId: 0
      };
    }

    const transactionId = transactionRepository.create({
      chargePointId,
      connectorId: payload.connectorId,
      idTag: payload.idTag,
      startTime: new Date(payload.timestamp),
      startMeterValue: payload.meterStart
    });

    chargePointRepository.updateStatus(chargePointId, 'charging');

    return {
      idTagInfo: { status: 'Accepted' },
      transactionId
    };
  }

  async handleStopTransaction(
    chargePointId: string,
    payload: StopTransactionRequest
  ): Promise<StopTransactionResponse> {
    console.log(`[OCPP] StopTransaction from ${chargePointId}`, payload);

    try {
      billingService.completeTransactionAndBilling(
        payload.transactionId,
        new Date(payload.timestamp),
        payload.meterStop
      );

      chargePointRepository.updateStatus(chargePointId, 'available');

      return {
        idTagInfo: { status: 'Accepted' }
      };
    } catch (error) {
      console.error('[OCPP] Error handling StopTransaction:', error);
      return {
        idTagInfo: { status: 'Rejected' }
      };
    }
  }

  async handleHeartbeat(chargePointId: string): Promise<HeartbeatResponse> {
    console.log(`[OCPP] Heartbeat from ${chargePointId}`);
    chargePointRepository.updateHeartbeat(chargePointId);

    return {
      currentTime: new Date().toISOString()
    };
  }

  async handleMessage(
    chargePointId: string,
    action: OCPPAction,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case 'BootNotification':
        return this.handleBootNotification(chargePointId, payload as BootNotificationRequest);
      case 'StartTransaction':
        return this.handleStartTransaction(chargePointId, payload as StartTransactionRequest);
      case 'StopTransaction':
        return this.handleStopTransaction(chargePointId, payload as StopTransactionRequest);
      case 'Heartbeat':
        return this.handleHeartbeat(chargePointId);
      default:
        throw new Error(`Unsupported OCPP action: ${action}`);
    }
  }
}

export const ocppHandler = new OCPPHandler();
