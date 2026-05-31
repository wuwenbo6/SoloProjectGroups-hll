const { Discovery } = require('node-onvif');
const Onvif = require('onvif');
const dgram = require('dgram');
const os = require('os');

class OnvifService {
  static async discoverDevices(timeout = 10000) {
    try {
      const devicesMap = new Map();
      
      const devices1 = await this.discoverWithNodeOnvif(timeout);
      devices1.forEach(d => devicesMap.set(`${d.ip_address}:${d.port}`, d));
      
      const devices2 = await this.discoverWithRawWSDiscovery(timeout);
      devices2.forEach(d => devicesMap.set(`${d.ip_address}:${d.port}`, d));
      
      const devices = Array.from(devicesMap.values());
      console.log(`Discovery complete. Found ${devices.length} devices.`);
      
      return devices;
    } catch (error) {
      console.error('Discovery error:', error);
      throw error;
    }
  }

  static async discoverWithNodeOnvif(timeout) {
    return new Promise((resolve) => {
      const devices = [];
      const timeoutId = setTimeout(() => resolve(devices), timeout);
      
      Discovery.startProbe().then((results) => {
        clearTimeout(timeoutId);
        for (const result of results) {
          const device = this.parseDiscoveryResult(result);
          if (device && device.ip_address) {
            devices.push(device);
          }
        }
        resolve(devices);
      }).catch(() => {
        clearTimeout(timeoutId);
        resolve(devices);
      });
    });
  }

  static async discoverWithRawWSDiscovery(timeout = 8000) {
    return new Promise((resolve) => {
      const devices = [];
      const discoveredIps = new Set();
      
      const socket = dgram.createSocket('udp4');
      
      const wsDiscoveryMessage = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${this.generateUuid()}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;

      socket.on('message', (msg, rinfo) => {
        try {
          const msgStr = msg.toString();
          const ip = rinfo.address;
          
          if (!discoveredIps.has(ip)) {
            discoveredIps.add(ip);
            
            const xaddrsMatch = msgStr.match(/XAddrs>([^<]+)<\/\w+:XAddrs/);
            const scopesMatch = msgStr.match(/Scopes>([^<]+)<\/\w+:Scopes/);
            const nameMatch = msgStr.match(/<\w+:Name[^>]*>([^<]+)<\/\w+:Name>/);
            
            let ip_address = ip;
            let port = 80;
            
            if (xaddrsMatch) {
              const xaddr = xaddrsMatch[1].split(' ')[0];
              const ipMatch = xaddr.match(/:\/\/([^:/]+)(?::(\d+))?/);
              if (ipMatch) {
                ip_address = ipMatch[1];
                port = ipMatch[2] ? parseInt(ipMatch[2]) : 80;
              }
            }
            
            let name = '';
            if (nameMatch) {
              name = nameMatch[1];
            } else if (scopesMatch) {
              const scopeMatch = scopesMatch[1].match(/name\/([^\s]+)/);
              if (scopeMatch) name = decodeURIComponent(scopeMatch[1]);
            }
            
            devices.push({
              urn: '',
              name: name || ip_address,
              ip_address,
              port,
              xaddrs: xaddrsMatch ? xaddrsMatch[1].split(' ') : [],
              scopes: scopesMatch ? scopesMatch[1].split(' ') : [],
              types: []
            });
          }
        } catch (e) {
        }
      });

      socket.bind(0, () => {
        socket.setBroadcast(true);
        
        const broadcastAddresses = this.getBroadcastAddresses();
        
        broadcastAddresses.forEach(addr => {
          try {
            socket.send(wsDiscoveryMessage, 3702, addr, () => {});
          } catch (e) {}
        });
        
        setTimeout(() => {
          try { socket.close(); } catch (e) {}
          resolve(devices);
        }, timeout);
      });

      socket.on('error', () => {
        try { socket.close(); } catch (e) {}
        resolve(devices);
      });
    });
  }

  static getBroadcastAddresses() {
    const addresses = ['239.255.255.250', '255.255.255.255'];
    const interfaces = os.networkInterfaces();
    
    for (const iface of Object.values(interfaces)) {
      for (const config of iface || []) {
        if (config.family === 'IPv4' && !config.internal) {
          const ipParts = config.address.split('.');
          const netmaskParts = config.netmask.split('.');
          const broadcast = ipParts.map((part, i) => 
            (parseInt(part) | (~parseInt(netmaskParts[i]) & 255))
          ).join('.');
          if (!addresses.includes(broadcast)) {
            addresses.push(broadcast);
          }
        }
      }
    }
    
    return addresses;
  }

  static generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static parseDiscoveryResult(result) {
    const device = {
      urn: result.urn || '',
      name: result.name || '',
      xaddrs: result.xaddrs || [],
      scopes: result.scopes || [],
      types: result.types || []
    };
    
    const allAddrs = [...(result.xaddrs || [])];
    if (result.probeMatches) {
      for (const match of result.probeMatches) {
        if (match.XAddrs) {
          allAddrs.push(...match.XAddrs.split(' '));
        }
      }
    }
    
    for (const xaddr of allAddrs) {
      const ipMatch = xaddr.match(/:\/\/([^:/]+)(?::(\d+))?/);
      if (ipMatch) {
        device.ip_address = ipMatch[1];
        device.port = ipMatch[2] ? parseInt(ipMatch[2]) : 80;
        break;
      }
    }
    
    return device;
  }

  static async connectCamera(ip, port = 80, username = '', password = '') {
    return new Promise((resolve, reject) => {
      new Onvif.Cam({
        hostname: ip,
        port: port,
        username: username,
        password: password,
        timeout: 5000
      }, (err, cam) => {
        if (err) {
          reject(err);
        } else {
          resolve(cam);
        }
      });
    });
  }

  static async getDeviceInfo(cam) {
    return new Promise((resolve, reject) => {
      cam.getDeviceInformation((err, info) => {
        if (err) {
          reject(err);
        } else {
          resolve(info);
        }
      });
    });
  }

  static async getStreamUri(cam, profileToken) {
    return new Promise((resolve, reject) => {
      cam.getStreamUri({
        protocol: 'RTSP',
        profileToken: profileToken
      }, (err, stream) => {
        if (err) {
          reject(err);
        } else {
          resolve(stream.uri);
        }
      });
    });
  }

  static async getCameraProfiles(cam) {
    return cam.profiles || [];
  }

  static hasPTZSupport(cam) {
    return !!cam.ptz;
  }
}

module.exports = OnvifService;
