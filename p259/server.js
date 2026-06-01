const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

function getFirstNonInternalIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getFirstNonInternalIPv4();
console.log(`[${new Date().toISOString()}] Using network interface: ${localIP}`);

function createDeviceXAddr(deviceId, path = 'onvif/device_service') {
  const ipParts = localIP.split('.');
  const subnet = ipParts.slice(0, 3).join('.');
  return `http://${subnet}.${100 + deviceId}/${path}`;
}

function createDevice(id, type, name, manufacturer, model, firmware, extra = {}) {
  const subnet = localIP.split('.').slice(0, 3).join('.');
  return {
    EndpointReference: `urn:uuid:3fdc97fe-23a0-4e32-9b75-6b8b0000000${id}`,
    Types: type,
    Scopes: extra.Scopes || '',
    XAddrs: createDeviceXAddr(id, extra.path || 'onvif/device_service'),
    MetadataVersion: '1',
    Name: name,
    Manufacturer: manufacturer,
    ManufacturerURL: extra.ManufacturerURL || '',
    Model: model,
    FirmwareVersion: firmware,
    SerialNumber: `SN-${extra.prefix || 'DEV'}-2024-0000${id}`,
    HardwareId: `HW-${extra.prefix || 'DEV'}-${model}-V${id}`,
    IPAddress: `${subnet}.${100 + id}`,
    MACAddress: `00:1A:2B:3C:4D:${id.toString().padStart(2, '0')}`,
    Port: 80,
    SupportedProtocols: extra.SupportedProtocols || 'HTTP',
    ...extra
  };
}

const mockDevices = [
  createDevice(1, 'dn:NetworkVideoTransmitter', 'IP Camera 01', 'ONVIF Manufacturer', 'IPCam-200', '1.0.0', {
    Scopes: 'onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/Hardware/IPCamera',
    ManufacturerURL: 'http://www.onvif-manufacturer.com',
    prefix: 'IPC',
    SupportedProtocols: 'ONVIF RTSP HTTP',
    VideoSources: 2,
    AudioSources: 1,
    MaxResolution: '1920x1080',
    PTZSupported: true,
    NightVision: true,
    WDR: true
  }),
  createDevice(2, 'dn:NetworkVideoTransmitter', 'IP Camera 02', 'ONVIF Manufacturer', 'IPCam-300', '2.1.0', {
    Scopes: 'onvif://www.onvif.org/Profile/Streaming onvif://www.onvif.org/Hardware/IPCamera',
    ManufacturerURL: 'http://www.onvif-manufacturer.com',
    prefix: 'IPC',
    SupportedProtocols: 'ONVIF RTSP HTTP HTTPS',
    VideoSources: 4,
    AudioSources: 2,
    MaxResolution: '3840x2160',
    PTZSupported: true,
    NightVision: true,
    WDR: true,
    AIEnabled: true
  }),
  createDevice(3, 'dn:Printer', 'Network Printer', 'PrintTech', 'PT-5000', '3.2.1', {
    Scopes: 'onvif://www.onvif.org/Profile/Printing',
    ManufacturerURL: 'http://www.printtech.com',
    path: 'ws/device_service',
    prefix: 'PT',
    SupportedProtocols: 'IPP LPD RAW HTTP',
    ColorSupported: true,
    DuplexSupported: true,
    MaxPaperSize: 'A4',
    PrintSpeed: '30 ppm',
    TrayCapacity: 250
  }),
  createDevice(4, 'dn:Thermostat', 'Smart Thermostat', 'HomeTech', 'HT-200', '1.5.2', {
    Scopes: 'onvif://www.onvif.org/Profile/Sensor',
    ManufacturerURL: 'http://www.hometech.com',
    path: 'ws/device_service',
    prefix: 'HT',
    SupportedProtocols: 'MQTT HTTP',
    TemperatureRange: '-10°C ~ 50°C',
    HumiditySupported: true,
    DisplaySupported: true,
    BatteryPowered: true,
    WiFiSupported: true
  })
];

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(devices) {
  const headers = [
    'Name', 'EndpointReference', 'Types', 'Scopes', 'XAddrs',
    'Manufacturer', 'Model', 'FirmwareVersion', 'SerialNumber',
    'HardwareId', 'IPAddress', 'MACAddress', 'Port', 'SupportedProtocols',
    'MetadataVersion'
  ];
  
  const rows = devices.map(device => {
    return headers.map(header => {
      return escapeCSV(device[header]);
    }).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (url.pathname === '/api/devices') {
    res.writeHead(200, { 
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(mockDevices, null, 2));
  } else if (url.pathname === '/api/devices/export') {
    const csv = generateCSV(mockDevices);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ws-discovery-devices-${timestamp}.csv"`,
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\ufeff');
    res.end(csv);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocket.Server({ server });

function generateMessageId() {
  return 'urn:uuid:' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function createHelloMessage(device) {
  return {
    Type: 'Hello',
    MessageID: generateMessageId(),
    To: 'urn:schemas-xmlsoap-org:ws:2005:04:discovery',
    Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/Hello',
    EndpointReference: device.EndpointReference,
    Types: device.Types,
    Scopes: device.Scopes,
    XAddrs: device.XAddrs,
    MetadataVersion: device.MetadataVersion,
    Name: device.Name,
    Manufacturer: device.Manufacturer,
    Model: device.Model,
    FirmwareVersion: device.FirmwareVersion
  };
}

function createByeMessage(device) {
  return {
    Type: 'Bye',
    MessageID: generateMessageId(),
    To: 'urn:schemas-xmlsoap-org:ws:2005:04:discovery',
    Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/Bye',
    EndpointReference: device.EndpointReference,
    Types: device.Types,
    Scopes: device.Scopes,
    XAddrs: device.XAddrs,
    MetadataVersion: device.MetadataVersion,
    Name: device.Name
  };
}

function createProbeMatchMessage(relatesTo, device) {
  return {
    Type: 'ProbeMatch',
    MessageID: generateMessageId(),
    RelatesTo: relatesTo,
    To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
    Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches',
    EndpointReference: device.EndpointReference,
    Types: device.Types,
    Scopes: device.Scopes,
    XAddrs: device.XAddrs,
    MetadataVersion: device.MetadataVersion,
    Name: device.Name,
    Manufacturer: device.Manufacturer,
    Model: device.Model,
    FirmwareVersion: device.FirmwareVersion
  };
}

function createResolveMatchMessage(relatesTo, device) {
  return {
    Type: 'ResolveMatch',
    MessageID: generateMessageId(),
    RelatesTo: relatesTo,
    To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
    Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/ResolveMatches',
    EndpointReference: device.EndpointReference,
    Types: device.Types,
    Scopes: device.Scopes,
    XAddrs: device.XAddrs,
    MetadataVersion: device.MetadataVersion,
    Name: device.Name,
    Manufacturer: device.Manufacturer,
    Model: device.Model,
    FirmwareVersion: device.FirmwareVersion
  };
}

function createMetadataMatchMessage(relatesTo, device) {
  return {
    Type: 'MetadataMatch',
    MessageID: generateMessageId(),
    RelatesTo: relatesTo,
    To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
    Action: 'http://schemas.xmlsoap.org/ws/2004/09/mex/GetMetadataResponse',
    EndpointReference: device.EndpointReference,
    MetadataVersion: device.MetadataVersion,
    Metadata: {
      Name: device.Name,
      Manufacturer: device.Manufacturer,
      ManufacturerURL: device.ManufacturerURL,
      Model: device.Model,
      FirmwareVersion: device.FirmwareVersion,
      SerialNumber: device.SerialNumber,
      HardwareId: device.HardwareId,
      IPAddress: device.IPAddress,
      MACAddress: device.MACAddress,
      Port: device.Port,
      SupportedProtocols: device.SupportedProtocols,
      Types: device.Types,
      Scopes: device.Scopes,
      XAddrs: device.XAddrs,
      ...(device.VideoSources !== undefined && { VideoSources: device.VideoSources }),
      ...(device.AudioSources !== undefined && { AudioSources: device.AudioSources }),
      ...(device.MaxResolution !== undefined && { MaxResolution: device.MaxResolution }),
      ...(device.PTZSupported !== undefined && { PTZSupported: device.PTZSupported }),
      ...(device.NightVision !== undefined && { NightVision: device.NightVision }),
      ...(device.WDR !== undefined && { WDR: device.WDR }),
      ...(device.AIEnabled !== undefined && { AIEnabled: device.AIEnabled }),
      ...(device.ColorSupported !== undefined && { ColorSupported: device.ColorSupported }),
      ...(device.DuplexSupported !== undefined && { DuplexSupported: device.DuplexSupported }),
      ...(device.MaxPaperSize !== undefined && { MaxPaperSize: device.MaxPaperSize }),
      ...(device.PrintSpeed !== undefined && { PrintSpeed: device.PrintSpeed }),
      ...(device.TrayCapacity !== undefined && { TrayCapacity: device.TrayCapacity }),
      ...(device.TemperatureRange !== undefined && { TemperatureRange: device.TemperatureRange }),
      ...(device.HumiditySupported !== undefined && { HumiditySupported: device.HumiditySupported }),
      ...(device.DisplaySupported !== undefined && { DisplaySupported: device.DisplaySupported }),
      ...(device.BatteryPowered !== undefined && { BatteryPowered: device.BatteryPowered }),
      ...(device.WiFiSupported !== undefined && { WiFiSupported: device.WiFiSupported })
    }
  };
}

function xpathIgnoreCaseMatch(pattern, text) {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (patternLower === textLower) return true;
  if (textLower.includes(patternLower)) return true;
  if (patternLower.includes(textLower)) return true;
  
  const patternParts = patternLower.split(/[:/]/);
  const textParts = textLower.split(/[:/]/);
  for (const pp of patternParts) {
    for (const tp of textParts) {
      if (pp && tp && pp === tp) return true;
    }
  }
  
  return false;
}

function matchProbe(probeMsg, device) {
  if (probeMsg.Types) {
    const probeTypes = probeMsg.Types.split(/\s+/).filter(t => t);
    const deviceTypes = device.Types.split(/\s+/).filter(t => t);
    const hasMatch = probeTypes.some(pt => 
      deviceTypes.some(dt => xpathIgnoreCaseMatch(pt, dt))
    );
    if (!hasMatch) return false;
  }
  if (probeMsg.Scopes) {
    const probeScopes = probeMsg.Scopes.split(/\s+/).filter(s => s);
    const deviceScopes = device.Scopes.split(/\s+/).filter(s => s);
    const hasMatch = probeScopes.some(ps => 
      deviceScopes.some(ds => xpathIgnoreCaseMatch(ps, ds))
    );
    if (!hasMatch) return false;
  }
  return true;
}

wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'] || generateMessageId();
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);

  mockDevices.forEach(device => {
    const helloMsg = createHelloMessage(device);
    ws.send(JSON.stringify(helloMsg));
    console.log(`[${new Date().toISOString()}] Sent Hello to ${clientId}: ${device.Name}`);
  });

  const addDeviceTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const newDeviceId = mockDevices.length + 1;
      const newDevice = {
        ...mockDevices[0],
        EndpointReference: 'urn:uuid:3fdc97fe-23a0-4e32-9b75-6b8b0000000' + newDeviceId,
        XAddrs: createDeviceXAddr(newDeviceId),
        Name: `New Device ${newDeviceId}`,
        SerialNumber: `SN-IPC-2024-000${newDeviceId}`,
        HardwareId: `HW-IPC-200-V${newDeviceId}`,
        IPAddress: `${localIP.split('.').slice(0,3).join('.')}.${100 + newDeviceId}`,
        MACAddress: `00:1A:2B:3C:4D:${newDeviceId.toString().padStart(2, '0')}`
      };
      mockDevices.push(newDevice);
      const helloMsg = createHelloMessage(newDevice);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(helloMsg));
        }
      });
      console.log(`[${new Date().toISOString()}] Broadcast Hello: ${newDevice.Name} (${newDevice.XAddrs})`);
    }
  }, 15000);

  const byeDeviceTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN && mockDevices.length > 1) {
      const removedDevice = mockDevices.pop();
      const byeMsg = createByeMessage(removedDevice);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(byeMsg));
        }
      });
      console.log(`[${new Date().toISOString()}] Broadcast Bye: ${removedDevice.Name}`);
    }
  }, 30000);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[${new Date().toISOString()}] Received from ${clientId}: ${msg.Type || 'Unknown'}`);

      if (msg.Type === 'Probe') {
        const matches = mockDevices.filter(device => matchProbe(msg, device));
        matches.forEach(device => {
          const matchMsg = createProbeMatchMessage(msg.MessageID, device);
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(matchMsg));
              console.log(`[${new Date().toISOString()}] Sent ProbeMatch to ${clientId}: ${device.Name}`);
            }
          }, Math.random() * 500);
        });
        if (matches.length === 0) {
          const noMatchMsg = {
            Type: 'ProbeMatches',
            MessageID: generateMessageId(),
            RelatesTo: msg.MessageID,
            To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
            Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches',
            ProbeMatch: []
          };
          ws.send(JSON.stringify(noMatchMsg));
          console.log(`[${new Date().toISOString()}] Sent empty ProbeMatches to ${clientId}`);
        }
      } else if (msg.Type === 'Resolve') {
        const device = mockDevices.find(d => d.EndpointReference === msg.EndpointReference);
        if (device) {
          const matchMsg = createResolveMatchMessage(msg.MessageID, device);
          ws.send(JSON.stringify(matchMsg));
          console.log(`[${new Date().toISOString()}] Sent ResolveMatch to ${clientId}: ${device.Name}`);
        } else {
          const noMatchMsg = {
            Type: 'ResolveMatches',
            MessageID: generateMessageId(),
            RelatesTo: msg.MessageID,
            To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
            Action: 'http://schemas.xmlsoap.org/ws/2005/04/discovery/ResolveMatches',
            ResolveMatch: null
          };
          ws.send(JSON.stringify(noMatchMsg));
          console.log(`[${new Date().toISOString()}] Resolve not found for ${msg.EndpointReference}`);
        }
      } else if (msg.Type === 'GetMetadata') {
        const device = mockDevices.find(d => d.EndpointReference === msg.EndpointReference);
        if (device) {
          const matchMsg = createMetadataMatchMessage(msg.MessageID, device);
          ws.send(JSON.stringify(matchMsg));
          console.log(`[${new Date().toISOString()}] Sent MetadataMatch to ${clientId}: ${device.Name}`);
        } else {
          const noMatchMsg = {
            Type: 'MetadataMatches',
            MessageID: generateMessageId(),
            RelatesTo: msg.MessageID,
            To: 'http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous',
            Action: 'http://schemas.xmlsoap.org/ws/2004/09/mex/GetMetadataResponse',
            MetadataMatch: null
          };
          ws.send(JSON.stringify(noMatchMsg));
          console.log(`[${new Date().toISOString()}] GetMetadata not found for ${msg.EndpointReference}`);
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error parsing message:`, err);
    }
  });

  ws.on('close', () => {
    clearTimeout(addDeviceTimer);
    clearTimeout(byeDeviceTimer);
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket error for ${clientId}:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on http://localhost:${PORT}`);
  console.log(`[${new Date().toISOString()}] WebSocket server ready on ws://localhost:${PORT}`);
});
