const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('events');

const RIP_PORT = 520;
const INF_METRIC = 16;
const UPDATE_INTERVAL = 10000;
const TIMEOUT_INTERVAL = 180000;
const GARBAGE_INTERVAL = 120000;

class RIPv2MD5Auth {
  constructor(keyChain) {
    this.keyChain = new Map();
    this.activeKeyId = null;
    if (keyChain && keyChain.length > 0) {
      keyChain.forEach(entry => {
        this.keyChain.set(entry.keyId, {
          keyId: entry.keyId,
          key: entry.key,
          startAccept: entry.startAccept ? new Date(entry.startAccept) : null,
          startGenerate: entry.startGenerate ? new Date(entry.startGenerate) : null,
          stopGenerate: entry.stopGenerate ? new Date(entry.stopGenerate) : null,
          stopAccept: entry.stopAccept ? new Date(entry.stopAccept) : null
        });
      });
      this.activeKeyId = keyChain[0].keyId;
    }
  }

  getActiveKey() {
    if (!this.activeKeyId) return null;
    const now = new Date();
    const keyEntry = this.keyChain.get(this.activeKeyId);
    if (!keyEntry) return null;
    if (keyEntry.startGenerate && now < keyEntry.startGenerate) return null;
    if (keyEntry.stopGenerate && now > keyEntry.stopGenerate) return null;
    return keyEntry;
  }

  generateAuthHeader() {
    const activeKey = this.getActiveKey();
    if (!activeKey) return null;
    const sequence = Date.now();
    return {
      authType: 2,
      keyId: activeKey.keyId,
      authDataLen: 16,
      sequence: sequence
    };
  }

  computeMD5Digest(payload, keyId) {
    const keyEntry = this.keyChain.get(keyId);
    if (!keyEntry) return null;
    const dataToSign = payload + keyEntry.key;
    return crypto.createHash('md5').update(dataToSign).digest('hex');
  }

  signUpdate(updatePayload) {
    const authHeader = this.generateAuthHeader();
    if (!authHeader) return updatePayload;
    const payload = JSON.stringify(updatePayload);
    const digest = this.computeMD5Digest(payload, authHeader.keyId);
    if (!digest) return updatePayload;
    return {
      ...updatePayload,
      authentication: {
        authType: 2,
        keyId: authHeader.keyId,
        authDataLen: 16,
        sequence: authHeader.sequence,
        md5Digest: digest
      }
    };
  }

  verifyUpdate(receivedPayload) {
    if (!receivedPayload.authentication) return false;
    const auth = receivedPayload.authentication;
    if (auth.authType !== 2) return false;
    const keyEntry = this.keyChain.get(auth.keyId);
    if (!keyEntry) return false;
    const now = new Date();
    if (keyEntry.startAccept && now < keyEntry.startAccept) return false;
    if (keyEntry.stopAccept && now > keyEntry.stopAccept) return false;
    const payloadCopy = { ...receivedPayload };
    const receivedDigest = payloadCopy.authentication.md5Digest;
    delete payloadCopy.authentication.md5Digest;
    const payloadCopy2 = { ...payloadCopy };
    delete payloadCopy2.authentication;
    const expectedDigest = this.computeMD5Digest(JSON.stringify(payloadCopy2), auth.keyId);
    if (!expectedDigest) return false;
    return receivedDigest === expectedDigest;
  }

  setKeyId(keyId) {
    if (this.keyChain.has(keyId)) {
      this.activeKeyId = keyId;
      return true;
    }
    return false;
  }

  getKeyChainInfo() {
    const keys = [];
    this.keyChain.forEach((entry) => {
      keys.push({
        keyId: entry.keyId,
        key: entry.key.substring(0, 3) + '****',
        isActive: entry.keyId === this.activeKeyId,
        startAccept: entry.startAccept ? entry.startAccept.toISOString() : null,
        startGenerate: entry.startGenerate ? entry.startGenerate.toISOString() : null,
        stopGenerate: entry.stopGenerate ? entry.stopGenerate.toISOString() : null,
        stopAccept: entry.stopAccept ? entry.stopAccept.toISOString() : null
      });
    });
    return {
      enabled: this.keyChain.size > 0,
      activeKeyId: this.activeKeyId,
      keys: keys
    };
  }
}

class RIPv2Router extends EventEmitter {
  constructor(routerId, udpPort, config) {
    super();
    this.routerId = routerId;
    this.udpPort = udpPort;
    this.config = config;
    this.routingTable = new Map();
    this.directlyConnectedNetworks = new Map();
    this.neighbors = new Map();
    this.interfaces = new Map();
    this.udpSocket = null;
    this.updateTimer = null;
    this.timeoutCheckTimer = null;
    this.triggeredUpdatePending = false;
    this.triggeredUpdateDelay = 500;
    this.authentication = null;
    this.authLog = [];
    if (config.keyChain && config.keyChain.length > 0) {
      this.authentication = new RIPv2MD5Auth(config.keyChain);
    }
  }

  addAuthLogEntry(entry) {
    entry.timestamp = new Date().toISOString();
    entry.routerId = this.routerId;
    this.authLog.unshift(entry);
    if (this.authLog.length > 50) {
      this.authLog.pop();
    }
    this.emit('authEvent', entry);
  }

  setAuthKeyId(keyId) {
    if (this.authentication) {
      const success = this.authentication.setKeyId(keyId);
      if (success) {
        this.addAuthLogEntry({ event: 'key_switch', keyId, success: true });
      } else {
        this.addAuthLogEntry({ event: 'key_switch', keyId, success: false, reason: 'Key not found' });
      }
      return success;
    }
    return false;
  }

  addInterface(interfaceName, network) {
    this.interfaces.set(interfaceName, {
      name: interfaceName,
      network: network,
      status: 'up',
      lastChange: Date.now()
    });
  }

  addDirectlyConnectedNetwork(network, nextHop, metric, interfaceName = null) {
    this.directlyConnectedNetworks.set(network, {
      nextHop: nextHop,
      metric: metric,
      isDirect: true,
      interfaceName: interfaceName
    });
    this.routingTable.set(network, {
      nextHop: nextHop,
      metric: metric,
      isDirect: true,
      lastUpdate: Date.now(),
      interfaceName: interfaceName,
      interfaceUp: true
    });
  }

  addNeighbor(neighborId, neighborHost, neighborPort) {
    this.neighbors.set(neighborId, {
      host: neighborHost,
      port: neighborPort
    });
  }

  setInterfaceStatus(interfaceName, status) {
    const iface = this.interfaces.get(interfaceName);
    if (!iface) {
      console.error(`[${this.routerId}] Interface ${interfaceName} not found`);
      return false;
    }

    if (iface.status === status) {
      return false;
    }

    const oldStatus = iface.status;
    iface.status = status;
    iface.lastChange = Date.now();

    console.log(`[${this.routerId}] Interface ${interfaceName} changed from ${oldStatus} to ${status}`);

    this.handleInterfaceStatusChange(interfaceName, status, oldStatus);

    this.emit('interfaceChanged', {
      routerId: this.routerId,
      interfaceName,
      oldStatus,
      newStatus: status,
      timestamp: new Date().toISOString()
    });

    this.scheduleTriggeredUpdate();

    return true;
  }

  handleInterfaceStatusChange(interfaceName, newStatus, oldStatus) {
    const iface = this.interfaces.get(interfaceName);
    if (!iface) return;

    const affectedNetwork = iface.network;

    for (const [network, route] of this.routingTable) {
      if (route.interfaceName === interfaceName) {
        if (newStatus === 'down') {
          route.metric = INF_METRIC;
          route.interfaceUp = false;
          route.garbageCollect = true;
          route.garbageStartTime = Date.now();
          this.emit('routeChanged', { 
            routerId: this.routerId, 
            network, 
            action: 'interface_down',
            interfaceName 
          });
        } else if (newStatus === 'up') {
          const directRoute = this.directlyConnectedNetworks.get(network);
          if (directRoute) {
            route.metric = directRoute.metric;
            route.interfaceUp = true;
            route.garbageCollect = false;
            route.lastUpdate = Date.now();
            this.emit('routeChanged', { 
              routerId: this.routerId, 
              network, 
              action: 'interface_up',
              interfaceName 
            });
          }
        }
      }
    }

    for (const [network, route] of this.directlyConnectedNetworks) {
      if (route.interfaceName === interfaceName) {
        route.interfaceUp = (newStatus === 'up');
      }
    }
  }

  scheduleTriggeredUpdate() {
    if (this.triggeredUpdatePending) {
      return;
    }

    this.triggeredUpdatePending = true;
    const delay = this.triggeredUpdateDelay + Math.random() * 500;

    setTimeout(() => {
      this.sendTriggeredUpdate();
      this.triggeredUpdatePending = false;
    }, delay);
  }

  sendTriggeredUpdate() {
    console.log(`[${this.routerId}] Sending triggered update`);
    this.sendUpdates(true);
  }

  start() {
    this.udpSocket = dgram.createSocket('udp4');
    
    this.udpSocket.on('message', (msg, rinfo) => {
      try {
        const update = JSON.parse(msg.toString());
        this.handleUpdate(update, rinfo);
      } catch (e) {
        console.error(`[${this.routerId}] Error parsing update:`, e.message);
      }
    });

    this.udpSocket.bind(this.udpPort, '127.0.0.1', () => {
      console.log(`[${this.routerId}] UDP socket bound to port ${this.udpPort}`);
    });

    this.updateTimer = setInterval(() => {
      this.sendUpdates();
    }, UPDATE_INTERVAL);

    this.timeoutCheckTimer = setInterval(() => {
      this.checkRouteTimeout();
    }, 5000);

    setTimeout(() => this.sendUpdates(), 1000);
  }

  stop() {
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.timeoutCheckTimer) clearInterval(this.timeoutCheckTimer);
    if (this.udpSocket) this.udpSocket.close();
  }

  handleUpdate(update, rinfo) {
    if (update.type !== 'ripv2-response') return;
    
    const sourceRouter = update.routerId;
    const sourcePort = update.port;

    if (this.authentication) {
      const verified = this.authentication.verifyUpdate(update);
      if (!verified) {
        this.addAuthLogEntry({ 
          event: 'auth_failed', 
          fromRouter: sourceRouter,
          keyId: update.authentication ? update.authentication.keyId : null,
          reason: update.authentication ? 'MD5 digest mismatch' : 'No authentication data'
        });
        console.error(`[${this.routerId}] Authentication failed for update from ${sourceRouter}`);
        return;
      }
      this.addAuthLogEntry({ 
        event: 'auth_success', 
        fromRouter: sourceRouter,
        keyId: update.authentication.keyId
      });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      fromRouter: sourceRouter,
      toRouter: this.routerId,
      routes: update.routes,
      isTriggered: update.isTriggered || false,
      authenticated: !!update.authentication,
      authKeyId: update.authentication ? update.authentication.keyId : null
    };
    this.emit('updateReceived', logEntry);

    let hasPoisonedRoute = false;

    for (const route of update.routes) {
      const { network, metric, poisoned } = route;
      const newMetric = Math.min(metric + 1, INF_METRIC);
      
      const wasUpdated = this.updateRoute(network, sourceRouter, newMetric, sourcePort, poisoned);
      if (wasUpdated && newMetric >= INF_METRIC) {
        hasPoisonedRoute = true;
      }
    }

    if (hasPoisonedRoute) {
      this.scheduleTriggeredUpdate();
    }
  }

  updateRoute(network, nextHop, newMetric, sourcePort, isPoisoned = false) {
    const existingRoute = this.routingTable.get(network);
    let routeChanged = false;
    let becameUnreachable = false;

    if (!existingRoute) {
      if (newMetric < INF_METRIC) {
        this.routingTable.set(network, {
          nextHop: nextHop,
          metric: newMetric,
          isDirect: false,
          lastUpdate: Date.now(),
          sourcePort: sourcePort,
          garbageCollect: false
        });
        this.emit('routeChanged', { routerId: this.routerId, network, action: 'added' });
        routeChanged = true;
      }
    } else {
      if (existingRoute.nextHop === nextHop) {
        if (newMetric >= INF_METRIC) {
          if (!existingRoute.garbageCollect) {
            existingRoute.metric = INF_METRIC;
            existingRoute.garbageCollect = true;
            existingRoute.garbageStartTime = Date.now();
            this.emit('routeChanged', { 
              routerId: this.routerId, 
              network, 
              action: 'marked_for_deletion',
              reason: isPoisoned ? 'poison_reverse' : 'timeout'
            });
            routeChanged = true;
            becameUnreachable = true;
          }
        } else {
          const oldMetric = existingRoute.metric;
          existingRoute.metric = newMetric;
          existingRoute.lastUpdate = Date.now();
          existingRoute.garbageCollect = false;
          existingRoute.sourcePort = sourcePort;
          if (oldMetric !== newMetric || existingRoute.garbageCollect) {
            this.emit('routeChanged', { routerId: this.routerId, network, action: 'updated' });
            routeChanged = true;
          }
        }
      } else if (newMetric < existingRoute.metric && newMetric < INF_METRIC) {
        this.routingTable.set(network, {
          nextHop: nextHop,
          metric: newMetric,
          isDirect: false,
          lastUpdate: Date.now(),
          sourcePort: sourcePort,
          garbageCollect: false
        });
        this.emit('routeChanged', { routerId: this.routerId, network, action: 'updated' });
        routeChanged = true;
      }
    }

    if (becameUnreachable) {
      this.scheduleTriggeredUpdate();
    }

    return routeChanged;
  }

  checkRouteTimeout() {
    const now = Date.now();
    let hasTimeout = false;

    for (const [network, route] of this.routingTable) {
      if (route.isDirect) continue;

      if (route.garbageCollect) {
        if (now - route.garbageStartTime > GARBAGE_INTERVAL) {
          this.routingTable.delete(network);
          this.emit('routeChanged', { routerId: this.routerId, network, action: 'removed' });
        }
      } else if (now - route.lastUpdate > TIMEOUT_INTERVAL) {
        route.metric = INF_METRIC;
        route.garbageCollect = true;
        route.garbageStartTime = now;
        this.emit('routeChanged', { 
          routerId: this.routerId, 
          network, 
          action: 'marked_for_deletion',
          reason: 'timeout'
        });
        hasTimeout = true;
      }
    }

    if (hasTimeout) {
      this.scheduleTriggeredUpdate();
    }
  }

  sendUpdates(isTriggered = false) {
    for (const [neighborId, neighbor] of this.neighbors) {
      const routes = this.getRoutingEntriesForNeighbor(neighborId, neighbor.port);
      let update = {
        type: 'ripv2-response',
        routerId: this.routerId,
        port: this.udpPort,
        timestamp: Date.now(),
        routes: routes,
        isTriggered: isTriggered
      };

      if (this.authentication) {
        update = this.authentication.signUpdate(update);
      }

      const message = Buffer.from(JSON.stringify(update));
      this.udpSocket.send(message, neighbor.port, neighbor.host, (err) => {
        if (err) {
          console.error(`[${this.routerId}] Error sending update to ${neighborId}:`, err.message);
        }
      });

      const logEntry = {
        timestamp: new Date().toISOString(),
        fromRouter: this.routerId,
        toRouter: neighborId,
        routes: routes,
        isTriggered: isTriggered,
        authenticated: !!this.authentication,
        authKeyId: update.authentication ? update.authentication.keyId : null
      };
      this.emit('updateSent', logEntry);
    }
  }

  getRoutingEntriesForNeighbor(neighborId, neighborPort) {
    const routes = [];
    
    for (const [network, route] of this.routingTable) {
      const entry = this.applySplitHorizonPoisonReverse(network, route, neighborId, neighborPort);
      if (entry) {
        routes.push(entry);
      }
    }

    return routes;
  }

  applySplitHorizonPoisonReverse(network, route, neighborId, neighborPort) {
    if (route.nextHop === neighborId) {
      return {
        network: network,
        metric: INF_METRIC,
        poisoned: true
      };
    }

    return {
      network: network,
      metric: route.metric,
      poisoned: false
    };
  }

  getRoutingTable() {
    const table = [];
    for (const [network, route] of this.routingTable) {
      table.push({
        network: network,
        nextHop: route.nextHop,
        metric: route.metric,
        isDirect: route.isDirect,
        garbageCollect: route.garbageCollect || false,
        interfaceName: route.interfaceName || null,
        interfaceUp: route.interfaceUp !== undefined ? route.interfaceUp : true
      });
    }
    return table;
  }

  getInterfaces() {
    const interfaces = [];
    for (const [name, iface] of this.interfaces) {
      interfaces.push({
        name: iface.name,
        network: iface.network,
        status: iface.status,
        lastChange: iface.lastChange
      });
    }
    return interfaces;
  }

  getInfo() {
    return {
      routerId: this.routerId,
      udpPort: this.udpPort,
      neighbors: Array.from(this.neighbors.keys()),
      interfaces: this.getInterfaces(),
      routingTable: this.getRoutingTable(),
      authentication: this.authentication ? this.authentication.getKeyChainInfo() : { enabled: false },
      authLog: this.authLog.slice(0, 20)
    };
  }

  exportZebraConfig() {
    const hostname = this.routerId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const lines = [];

    lines.push('! Zebra/Quagga Configuration');
    lines.push(`! Generated from RIPv2 Simulator - ${this.routerId}`);
    lines.push(`! Date: ${new Date().toISOString()}`);
    lines.push('!');
    lines.push(`hostname ${hostname}`);
    lines.push('password zebra');
    lines.push('enable password zebra');
    lines.push('!');
    lines.push('interface lo');
    lines.push(' ip address 127.0.0.1/8');
    lines.push(' ipv6 address ::1/128');
    lines.push('!');

    for (const [name, iface] of this.interfaces) {
      lines.push(`interface ${name}`);
      const directNet = this.directlyConnectedNetworks.get(iface.network);
      if (directNet) {
        const addr = this.networkToAddress(iface.network);
        lines.push(` ip address ${addr}`);
      }
      if (iface.status === 'down') {
        lines.push(' shutdown');
      }
      lines.push('!');
    }

    lines.push('router rip');
    lines.push(' version 2');

    if (this.authentication) {
      const authInfo = this.authentication.getKeyChainInfo();
      lines.push(` key chain ripv2-key-chain-${hostname}`);
      if (authInfo.activeKeyId !== null) {
        lines.push(` key ${authInfo.activeKeyId}`);
      }
    }

    lines.push(' redistribute connected');
    lines.push(' redistribute kernel');
    lines.push(' network 0.0.0.0/0');

    for (const [name, iface] of this.interfaces) {
      if (iface.status === 'up') {
        lines.push(` network ${iface.network}`);
      }
    }

    lines.push(' no auto-summary');
    lines.push('!');

    lines.push('key chain ripv2-key-chain-' + hostname);
    if (this.authentication) {
      const authInfo = this.authentication.getKeyChainInfo();
      authInfo.keys.forEach(key => {
        lines.push(` key ${key.keyId}`);
        lines.push(`  key-string ${key.key.substring(0, 3)}****`);
        if (key.startAccept) {
          lines.push(`  accept-lifetime ${this.formatZebraTime(key.startAccept)}`);
        }
        if (key.startGenerate) {
          lines.push(`  send-lifetime ${this.formatZebraTime(key.startGenerate)}`);
        }
        if (key.stopAccept) {
          lines.push(`  accept-lifetime ${this.formatZebraTime(key.stopAccept)}`);
        }
        if (key.stopGenerate) {
          lines.push(`  send-lifetime ${this.formatZebraTime(key.stopGenerate)}`);
        }
      });
    }
    lines.push('!');

    lines.push('router rip');
    lines.push(' version 2');
    if (this.authentication) {
      lines.push(' authentication mode md5');
      lines.push(` authentication key-chain ripv2-key-chain-${hostname}`);
    }
    lines.push('!');

    lines.push('ip forwarding');
    lines.push('ipv6 forwarding');
    lines.push('!');

    lines.push('line vty');
    lines.push(' exec-timeout 0 0');
    lines.push(' password zebra');
    lines.push('!');

    lines.push(`! Routing table for ${this.routerId}:`);
    lines.push('!');

    const sortedRoutes = Array.from(this.routingTable.entries()).sort((a, b) => {
      return a[0].localeCompare(b[0]);
    });

    for (const [network, route] of sortedRoutes) {
      if (route.isDirect) {
        lines.push(`! C    ${network} is directly connected, ${route.interfaceName || 'unknown'}`);
      } else if (route.garbageCollect) {
        lines.push(`! R    ${network} [${route.metric}/0] via ${route.nextHop} (expired)`);
      } else {
        lines.push(`! R    ${network} [${route.metric}/0] via ${route.nextHop}`);
      }
    }

    lines.push('!');
    lines.push('! End of configuration');

    return lines.join('\n');
  }

  networkToAddress(network) {
    const parts = network.split('/');
    const subnet = parts[0];
    const prefix = parseInt(parts[1]) || 24;
    const octets = subnet.split('.').map(Number);
    let hostOctet = 1;
    if (octets[3] + hostOctet > 254) {
      hostOctet = 0;
    }
    return `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3] + hostOctet}/${prefix}`;
  }

  formatZebraTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

module.exports = RIPv2Router;
