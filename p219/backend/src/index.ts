import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { AvrdudeService } from './avrdude';
import { ClientMessage, MCU_LIST, PROGRAMMER_LIST, FUSE_CONFIGS } from './types';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.hex') || file.originalname.endsWith('.eep')) {
      cb(null, true);
    } else {
      cb(new Error('Only .hex or .eep files are allowed'));
    }
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    mcus: MCU_LIST,
    programmers: PROGRAMMER_LIST,
    fuseConfigs: FUSE_CONFIGS
  });
});

app.post('/api/upload', upload.single('hexFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  res.json({
    success: true,
    fileId: req.file.filename,
    fileName: req.file.originalname,
    fileSize: req.file.size
  });
});

wss.on('connection', (ws: WebSocket & { isAlive?: boolean; heartbeatTimer?: NodeJS.Timeout; heartbeatTimeout?: NodeJS.Timeout }) => {
  console.log('New WebSocket connection');
  
  ws.isAlive = true;
  const avrdudeService = new AvrdudeService(ws);

  const sendPing = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ping',
        payload: { heartbeat: Date.now(), timestamp: Date.now() }
      }));
    }
  };

  ws.heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      sendPing();
      
      ws.heartbeatTimeout = setTimeout(() => {
        if (ws.isAlive === false) {
          console.log('WebSocket heartbeat timeout, closing connection');
          ws.terminate();
        } else {
          ws.isAlive = false;
        }
      }, HEARTBEAT_TIMEOUT);
    }
  }, HEARTBEAT_INTERVAL);

  ws.on('message', async (data: string) => {
    try {
      const message: ClientMessage = JSON.parse(data);
      
      if (message.type === 'pong') {
        ws.isAlive = true;
        if (ws.heartbeatTimeout) {
          clearTimeout(ws.heartbeatTimeout);
        }
        return;
      }
      
      switch (message.type) {
        case 'flash':
          if (message.payload.hexFile) {
            await avrdudeService.flash(
              message.payload.hexFile,
              message.payload.mcu,
              message.payload.programmer,
              message.payload.port,
              message.payload.baudRate,
              message.payload.bitClock,
              message.payload.verifySignature ?? true
            );
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'No HEX file specified', level: 'error', timestamp: Date.now() }
            }));
          }
          break;
          
        case 'erase':
          await avrdudeService.erase(
            message.payload.mcu,
            message.payload.programmer,
            message.payload.port,
            message.payload.bitClock
          );
          break;
          
        case 'stop':
          avrdudeService.stop();
          break;
          
        case 'read_fuses':
          await avrdudeService.readFuses(
            message.payload.mcu,
            message.payload.programmer,
            message.payload.port,
            message.payload.baudRate,
            message.payload.bitClock
          );
          break;
          
        case 'write_fuses':
          if (message.payload.fuses) {
            await avrdudeService.writeFuses(
              message.payload.fuses,
              message.payload.mcu,
              message.payload.programmer,
              message.payload.port,
              message.payload.baudRate,
              message.payload.bitClock
            );
          }
          break;
          
        case 'read_eeprom':
          await avrdudeService.readEeprom(
            message.payload.mcu,
            message.payload.programmer,
            message.payload.port,
            message.payload.baudRate,
            message.payload.bitClock
          );
          break;
          
        case 'write_eeprom':
          if (message.payload.eepromFile) {
            await avrdudeService.writeEeprom(
              message.payload.eepromFile,
              message.payload.mcu,
              message.payload.programmer,
              message.payload.port,
              message.payload.baudRate,
              message.payload.bitClock
            );
          }
          break;
          
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Invalid message format', level: 'error', timestamp: Date.now() }
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (ws.heartbeatTimer) {
      clearInterval(ws.heartbeatTimer);
    }
    if (ws.heartbeatTimeout) {
      clearTimeout(ws.heartbeatTimeout);
    }
    avrdudeService.cleanup();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (ws.heartbeatTimer) {
      clearInterval(ws.heartbeatTimer);
    }
    if (ws.heartbeatTimeout) {
      clearTimeout(ws.heartbeatTimeout);
    }
    avrdudeService.cleanup();
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL}ms, timeout: ${HEARTBEAT_TIMEOUT}ms`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
