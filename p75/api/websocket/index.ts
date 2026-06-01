import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getLatestData, getConnectionStatus } from '../opcua/client.js';
import { insertSensorData, insertAlarmLog } from '../database/index.js';

let io: Server | null = null;
let dataInterval: NodeJS.Timeout | null = null;
let lastAlarmState = false;

export function initWebSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('plc:status', { connected: getConnectionStatus() });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  startDataBroadcast();

  console.log('WebSocket server initialized');
}

function startDataBroadcast() {
  if (dataInterval) {
    clearInterval(dataInterval);
  }

  dataInterval = setInterval(() => {
    const data = getLatestData();
    insertSensorData(data.temperature, data.pressure);

    if (data.alarm && !lastAlarmState) {
      let alarmType = 'unknown';
      let message = '设备异常告警';

      if (data.temperature > 75) {
        alarmType = 'temperature_high';
        message = `温度过高: ${data.temperature.toFixed(1)}°C`;
      } else if (data.pressure > 2.2) {
        alarmType = 'pressure_high';
        message = `压力过高: ${data.pressure.toFixed(2)} MPa`;
      }

      insertAlarmLog(
        alarmType,
        message,
        'critical',
        data.temperature,
        data.pressure
      );

      if (io) {
        io.emit('alarm:new', {
          type: alarmType,
          message,
          temperature: data.temperature,
          pressure: data.pressure,
          timestamp: data.timestamp,
        });
      }
    }
    lastAlarmState = data.alarm;

    if (io) {
      io.emit('data:update', data);
      io.emit('plc:status', { connected: getConnectionStatus() });
    }
  }, 1000);
}

export function broadcastDownloadProgress(downloadId: number, progress: number, status: string) {
  if (io) {
    io.emit('download:progress', {
      downloadId,
      progress,
      status,
    });
  }
}

export function getIO() {
  return io;
}
