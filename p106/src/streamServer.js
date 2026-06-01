const express = require('express');
const http = require('http');
const EventEmitter = require('events');

class StreamServer extends EventEmitter {
  constructor(port = 8080) {
    super();
    this.port = port;
    this.app = express();
    this.server = null;
    this.aacStream = null;
    this.currentMetadata = {
      stationName: '',
      programType: '',
      radioText: ''
    };
    this.connections = new Set();
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    this.app.get('/stream.aac', (req, res) => {
      this.handleStreamRequest(req, res);
    });

    this.app.get('/metadata', (req, res) => {
      res.json(this.currentMetadata);
    });

    this.app.get('/status', (req, res) => {
      res.json({
        running: this.aacStream !== null,
        listeners: this.connections.size,
        metadata: this.currentMetadata
      });
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    this.app.use(express.static('public'));
  }

  handleStreamRequest(req, res) {
    console.log('New stream connection from', req.ip);

    res.setHeader('Content-Type', 'audio/aac');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    this.connections.add(res);

    req.on('close', () => {
      console.log('Stream connection closed');
      this.connections.delete(res);
    });

    req.on('error', (err) => {
      console.error('Stream request error:', err);
      this.connections.delete(res);
    });
  }

  setAACStream(stream) {
    if (this.aacStream) {
      this.aacStream.removeAllListeners('data');
    }

    this.aacStream = stream;

    if (stream) {
      stream.on('data', (data) => {
        this.broadcastData(data);
      });
    }
  }

  broadcastData(data) {
    this.connections.forEach(conn => {
      try {
        conn.write(data);
      } catch (err) {
        console.error('Error broadcasting to client:', err);
        this.connections.delete(conn);
      }
    });
  }

  updateMetadata(metadata) {
    this.currentMetadata = { ...this.currentMetadata, ...metadata };
    this.emit('metadataUpdated', this.currentMetadata);
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve(this.port);
        return;
      }

      this.server = http.createServer(this.app);
      
      this.server.on('error', (err) => {
        console.error('Stream server error:', err);
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`Stream server running on http://localhost:${this.port}`);
        console.log(`Stream URL: http://localhost:${this.port}/stream.aac`);
        resolve(this.port);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.connections.forEach(conn => {
        try {
          conn.end();
        } catch (e) {}
      });
      this.connections.clear();

      if (this.server) {
        this.server.close(() => {
          console.log('Stream server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getStreamUrl() {
    return `http://localhost:${this.port}/stream.aac`;
  }

  getMetadataUrl() {
    return `http://localhost:${this.port}/metadata`;
  }

  isRunning() {
    return this.server !== null && this.server.listening;
  }
}

module.exports = { StreamServer };
