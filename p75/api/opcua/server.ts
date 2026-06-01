import {
  OPCUAServer,
  Variant,
  DataType,
  StatusCodes,
  SessionContext,
  AddVariableOptions,
} from 'node-opcua';

let server: OPCUAServer | null = null;

let currentTemperature = 25.0;
let currentPressure = 1.0;
let deviceStatus = true;
let alarmStatus = false;

function updateSimulationData() {
  const tempDelta = (Math.random() - 0.5) * 2;
  const pressDelta = (Math.random() - 0.5) * 0.1;

  currentTemperature = Math.max(15, Math.min(85, currentTemperature + tempDelta));
  currentPressure = Math.max(0.5, Math.min(2.5, currentPressure + pressDelta));

  alarmStatus = currentTemperature > 75 || currentPressure > 2.2;
}

export async function startOpcUaServer(): Promise<OPCUAServer> {
  server = new OPCUAServer({
    port: 4840,
    resourcePath: '/UA/PLC_Server',
    buildInfo: {
      productName: 'PLC Simulation Server',
      buildNumber: '1',
      buildDate: new Date(),
    },
    serverInfo: {
      applicationUri: 'urn:localhost:OPCUA:PLCServer',
      productUri: 'urn:localhost:OPCUA:PLCServer',
      applicationName: { text: 'PLC Simulation Server', locale: 'en' },
      gatewayServerUri: null,
      discoveryProfileUri: null,
      discoveryUrls: [],
    },
    allowAnonymous: true,
  });

  await server.initialize();

  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace!.getOwnNamespace();

  const device = namespace.addObject({
    organizedBy: addressSpace!.rootFolder.objects,
    browseName: 'PLC_Device',
  });

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=Temperature',
    browseName: 'Temperature',
    dataType: 'Double',
    value: {
      get: () => new Variant({
        dataType: DataType.Double,
        value: currentTemperature,
      }),
    },
  } as AddVariableOptions);

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=Pressure',
    browseName: 'Pressure',
    dataType: 'Double',
    value: {
      get: () => new Variant({
        dataType: DataType.Double,
        value: currentPressure,
      }),
    },
  } as AddVariableOptions);

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=Status',
    browseName: 'Status',
    dataType: 'Boolean',
    value: {
      get: () => new Variant({
        dataType: DataType.Boolean,
        value: deviceStatus,
      }),
    },
  } as AddVariableOptions);

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=Alarm',
    browseName: 'Alarm',
    dataType: 'Boolean',
    value: {
      get: () => new Variant({
        dataType: DataType.Boolean,
        value: alarmStatus,
      }),
    },
  } as AddVariableOptions);

  setInterval(updateSimulationData, 1000);

  await server.start();
  console.log('OPC UA Server is running on port 4840');
  console.log('  Server URI:', server.endpoints[0].endpointDescriptions()[0].endpointUrl);

  return server;
}

export function getCurrentData() {
  return {
    temperature: currentTemperature,
    pressure: currentPressure,
    status: deviceStatus,
    alarm: alarmStatus,
    timestamp: new Date().toISOString(),
  };
}

export async function stopOpcUaServer() {
  if (server) {
    await server.shutdown(0);
    server = null;
    console.log('OPC UA Server stopped');
  }
}
