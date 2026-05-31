const aedes = require('aedes');
const net = require('net');
const http = require('http');
const ws = require('ws');

class MqttBroker {
  constructor() {
    this.aedes = aedes();
    this.tcpPort = process.env.MQTT_PORT || 1883;
    this.wsPort = process.env.WS_PORT || 8080;
    this.tcpServer = null;
    this.wsServer = null;
  }

  start() {
    this.setupEventHandlers();
    this.startTcpServer();
    this.startWsServer();
    console.log(`MQTT Broker started on TCP port ${this.tcpPort} and WS port ${this.wsPort}`);
  }

  setupEventHandlers() {
    this.aedes.on('client', (client) => {
      console.log(`Client connected: ${client.id}`);
    });

    this.aedes.on('clientDisconnect', (client) => {
      console.log(`Client disconnected: ${client.id}`);
    });

    this.aedes.on('publish', (packet, client) => {
      if (client) {
        console.log(`Client ${client.id} published to ${packet.topic}`);
      }
    });

    this.aedes.on('subscribe', (subscriptions, client) => {
      console.log(`Client ${client.id} subscribed to: ${subscriptions.map(s => s.topic).join(', ')}`);
    });
  }

  startTcpServer() {
    this.tcpServer = net.createServer(this.aedes.handle);
    this.tcpServer.listen(this.tcpPort, () => {
      console.log(`MQTT TCP Server listening on port ${this.tcpPort}`);
    });
  }

  startWsServer() {
    const httpServer = http.createServer();
    this.wsServer = new ws.Server({ server: httpServer });
    
    this.wsServer.on('connection', (socket, request) => {
      const duplex = ws.createWebSocketStream(socket);
      this.aedes.handle(duplex);
    });

    httpServer.listen(this.wsPort, () => {
      console.log(`MQTT WebSocket Server listening on port ${this.wsPort}`);
    });
  }

  publish(topic, message) {
    this.aedes.publish({
      topic,
      payload: typeof message === 'string' ? message : JSON.stringify(message),
      qos: 1,
      retain: false
    });
  }

  subscribe(topic, callback) {
    this.aedes.subscribe(topic, (packet, next) => {
      try {
        const message = JSON.parse(packet.payload.toString());
        callback(packet.topic, message);
      } catch (e) {
        callback(packet.topic, packet.payload.toString());
      }
      next();
    });
  }

  stop() {
    if (this.tcpServer) this.tcpServer.close();
    if (this.wsServer) this.wsServer.close();
    this.aedes.close();
  }
}

module.exports = MqttBroker;
