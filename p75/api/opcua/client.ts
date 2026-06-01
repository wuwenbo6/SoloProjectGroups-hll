import { OPCUAClient, ClientSession, AttributeIds, ClientMonitoredItem, TimestampsToReturn, MonitoringParametersOptions, DataValue, ClientSubscription } from 'node-opcua';

let client: OPCUAClient | null = null;
let session: ClientSession | null = null;
let subscription: ClientSubscription | null = null;
let isConnected = false;
let isReconnecting = false;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

const endpointUrl = 'opc.tcp://localhost:4840/UA/PLC_Server';
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY = 5000;

export interface SensorData {
  temperature: number;
  pressure: number;
  status: boolean;
  alarm: boolean;
  timestamp: string;
}

let latestData: SensorData = {
  temperature: 25.0,
  pressure: 1.0,
  status: true,
  alarm: false,
  timestamp: new Date().toISOString(),
};

function scheduleReconnect() {
  if (isReconnecting) return;
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnection attempts reached, giving up');
    return;
  }

  reconnectAttempts++;
  console.log(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_DELAY}ms...`);
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  reconnectTimer = setTimeout(async () => {
    await connectOpcUaClient();
  }, RECONNECT_DELAY);
}

async function cleanupConnection() {
  try {
    if (subscription) {
      try {
        await subscription.terminate();
      } catch (e) { /* ignore */ }
      subscription = null;
    }
    if (session) {
      try {
        await session.close();
      } catch (e) { /* ignore */ }
      session = null;
    }
    if (client) {
      try {
        await client.disconnect();
      } catch (e) { /* ignore */ }
      client = null;
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  
  isConnected = false;
}

function setupConnectionMonitoring() {
  if (!client) return;

  client.on('connection_lost', () => {
    console.warn('OPC UA Connection lost!');
    isConnected = false;
    scheduleReconnect();
  });

  client.on('close', () => {
    console.warn('OPC UA Client connection closed');
    isConnected = false;
    scheduleReconnect();
  });

  client.on('backoff', (retry: number, delay: number) => {
    console.log(`OPC UA backoff: retry ${retry}, delay ${delay}ms`);
  });
}

export async function connectOpcUaClient(): Promise<boolean> {
  if (isReconnecting) return false;
  
  isReconnecting = true;
  
  try {
    await cleanupConnection();
    
    client = OPCUAClient.create({
      endpointMustExist: false,
      connectionStrategy: {
        maxRetry: 3,
        initialDelay: 1000,
        maxDelay: 5000,
      },
      keepSessionAlive: true,
    });

    setupConnectionMonitoring();

    await client.connect(endpointUrl);
    console.log('OPC UA Client connected to', endpointUrl);

    session = await client.createSession();
    console.log('OPC UA Session created');

    session.on('session_closed', () => {
      console.warn('OPC UA Session closed!');
      isConnected = false;
      scheduleReconnect();
    });

    session.on('keepalive', () => {
    });

    session.on('keepalive_failure', () => {
      console.warn('OPC UA Keepalive failure!');
      scheduleReconnect();
    });

    isConnected = true;
    isReconnecting = false;
    reconnectAttempts = 0;
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    await setupMonitoredItems();

    return true;
  } catch (error) {
    console.error('Failed to connect OPC UA Client:', error);
    isConnected = false;
    isReconnecting = false;
    scheduleReconnect();
    return false;
  }
}

async function setupMonitoredItems() {
  if (!session) return;

  try {
    subscription = await session.createSubscription2({
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
    });

    subscription.on('terminated', () => {
      console.warn('OPC UA Subscription terminated!');
      scheduleReconnect();
    });

    const nodesToMonitor = [
      { nodeId: 'ns=1;s=Temperature', name: 'temperature' },
      { nodeId: 'ns=1;s=Pressure', name: 'pressure' },
      { nodeId: 'ns=1;s=Status', name: 'status' },
      { nodeId: 'ns=1;s=Alarm', name: 'alarm' },
    ];

    for (const { nodeId, name } of nodesToMonitor) {
      const monitoredItem = ClientMonitoredItem.create(
        subscription,
        {
          nodeId,
          attributeId: AttributeIds.Value,
        },
        {
          samplingInterval: 1000,
          discardOldest: true,
          queueSize: 1,
        } as MonitoringParametersOptions,
        TimestampsToReturn.Both
      );

      monitoredItem.on('changed', (dataValue: DataValue) => {
        if (dataValue.value !== null) {
          (latestData as any)[name] = dataValue.value.value;
          latestData.timestamp = new Date().toISOString();
        }
      });

      monitoredItem.on('err', (err: Error) => {
        console.error(`Monitored item ${name} error:`, err);
      });
    }

    console.log('Monitored items setup complete');
  } catch (error) {
    console.error('Error setting up monitored items:', error);
    scheduleReconnect();
  }
}

export function getLatestData(): SensorData {
  return { ...latestData };
}

export function getConnectionStatus(): boolean {
  return isConnected;
}

export function getReconnectInfo() {
  return {
    reconnectAttempts,
    isReconnecting,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  };
}

export async function disconnectOpcUaClient() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  isReconnecting = false;
  reconnectAttempts = 0;
  
  try {
    if (subscription) {
      try {
        await subscription.terminate();
      } catch (e) { /* ignore */ }
      subscription = null;
    }
    if (session) {
      try {
        await session.close();
      } catch (e) { /* ignore */ }
      session = null;
    }
    if (client) {
      try {
        await client.disconnect();
      } catch (e) { /* ignore */ }
      client = null;
    }
  } catch (error) {
    console.error('Error disconnecting OPC UA Client:', error);
  }
  
  isConnected = false;
  console.log('OPC UA Client disconnected');
}
