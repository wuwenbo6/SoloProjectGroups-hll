export interface ChargePoint {
  id: string;
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  firmwareVersion?: string;
  status: 'available' | 'charging' | 'offline' | 'faulted';
  lastHeartbeat?: Date;
  createdAt: Date;
}

export interface Transaction {
  id: number;
  chargePointId: string;
  connectorId: number;
  idTag: string;
  startTime: Date;
  stopTime?: Date;
  startMeterValue: number;
  stopMeterValue?: number;
  energyConsumed?: number;
  duration?: number;
  status: 'active' | 'completed' | 'stopped';
}

export interface BillingDetail {
  id: number;
  transactionId: number;
  energyConsumed: number;
  durationMinutes: number;
  energyPrice: number;
  servicePrice: number;
  energyCost: number;
  serviceCost: number;
  totalCost: number;
  pricingRuleId?: number;
  createdAt: Date;
}

export interface PricingRule {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  energyRate: number;
  serviceRate: number;
  isActive: boolean;
}

export interface DashboardStats {
  onlineChargePoints: number;
  totalChargePoints: number;
  activeTransactions: number;
  todayEnergy: number;
  todayRevenue: number;
}

export interface BootNotificationRequest {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  firmwareVersion?: string;
}

export interface BootNotificationResponse {
  status: 'Accepted' | 'Rejected';
  currentTime: string;
  interval: number;
}

export interface StartTransactionRequest {
  connectorId: number;
  idTag: string;
  timestamp: string;
  meterStart: number;
}

export interface StartTransactionResponse {
  idTagInfo: { status: 'Accepted' | 'Rejected' };
  transactionId: number;
}

export interface StopTransactionRequest {
  transactionId: number;
  idTag?: string;
  timestamp: string;
  meterStop: number;
  reason?: string;
}

export interface StopTransactionResponse {
  idTagInfo?: { status: 'Accepted' | 'Rejected' };
}

export interface HeartbeatRequest {}

export interface HeartbeatResponse {
  currentTime: string;
}

export interface RemoteStartTransactionRequest {
  connectorId?: number;
  idTag: string;
}

export interface RemoteStartTransactionResponse {
  status: 'Accepted' | 'Rejected';
}

export interface RemoteStopTransactionRequest {
  transactionId: number;
}

export interface RemoteStopTransactionResponse {
  status: 'Accepted' | 'Rejected';
}

export type OCPPAction = 'BootNotification' | 'StartTransaction' | 'StopTransaction' | 'Heartbeat' | 'RemoteStartTransaction' | 'RemoteStopTransaction';

export interface OCPPMessage {
  action: OCPPAction;
  payload: Record<string, unknown>;
  chargePointId: string;
}
