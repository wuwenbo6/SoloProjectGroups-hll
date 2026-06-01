import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { luaSandbox } from './luaSandbox';
import { WebSocketService } from './websocket';
import { templateStore } from './templates';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const wsService = new WebSocketService(server);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/execute', async (req, res) => {
  try {
    const { luaCode, accessLogs, sessionId } = req.body;

    if (!luaCode) {
      return res.status(400).json({
        success: false,
        error: 'Lua code is required',
      });
    }

    const logs = Array.isArray(accessLogs)
      ? accessLogs.filter((line: string) => line.trim())
      : [];

    const execSessionId = sessionId || `exec_${uuidv4()}`;

    if (sessionId) {
      wsService.broadcastProgress(sessionId, 0, 'Starting execution...');
    }

    const result = await luaSandbox.executeScript(luaCode, logs);

    if (sessionId) {
      if (result.success) {
        wsService.broadcastResult(sessionId, result);
        wsService.broadcastStats(sessionId, result.stats);
      } else {
        wsService.broadcastError(sessionId, result.errors.join(', '));
      }
    }

    res.json({ ...result, sessionId: execSessionId });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      output: '',
      stats: {},
      errors: [error.message],
      extractedData: [],
    });
  }
});

app.get('/api/templates', (req, res) => {
  const { category } = req.query;
  const templates = templateStore.getByCategory(category as string | undefined);
  res.json({ templates });
});

app.get('/api/templates/categories', (_req, res) => {
  const categories = templateStore.getCategories();
  res.json({ categories });
});

app.get('/api/templates/:id', (req, res) => {
  const template = templateStore.getById(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ template });
});

app.post('/api/templates', (req, res) => {
  try {
    const { name, description, code, category } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const template = templateStore.create({
      name,
      description: description || '',
      code,
      category: category || '自定义',
    });

    res.status(201).json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/templates/:id', (req, res) => {
  const template = templateStore.update(req.params.id, req.body);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ template });
});

app.delete('/api/templates/:id', (req, res) => {
  const success = templateStore.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ success: true });
});

app.get('/api/sample-logs', (req, res) => {
  const sampleLogs = [
    '127.0.0.1 - - [30/May/2026:10:00:01 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"',
    '127.0.0.1 - - [30/May/2026:10:00:02 +0800] "POST /api/login HTTP/1.1" 200 567 "-" "Mozilla/5.0"',
    '127.0.0.1 - - [30/May/2026:10:00:03 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Chrome/120.0"',
    '127.0.0.1 - - [30/May/2026:10:00:04 +0800] "GET /api/products HTTP/1.1" 200 2345 "-" "Mozilla/5.0"',
    '127.0.0.1 - - [30/May/2026:10:00:05 +0800] "GET /api/users HTTP/1.1" 404 123 "-" "Safari/17.0"',
    '127.0.0.1 - - [30/May/2026:10:00:06 +0800] "PUT /api/users/1 HTTP/1.1" 200 456 "-" "Mozilla/5.0"',
    '127.0.0.1 - - [30/May/2026:10:00:07 +0800] "GET /api/products HTTP/1.1" 200 2345 "-" "Chrome/120.0"',
    '127.0.0.1 - - [30/May/2026:10:00:08 +0800] "DELETE /api/users/2 HTTP/1.1" 204 0 "-" "Mozilla/5.0"',
    '127.0.0.1 - - [30/May/2026:10:00:09 +0800] "GET /api/orders HTTP/1.1" 200 3456 "-" "Chrome/120.0"',
    '127.0.0.1 - - [30/May/2026:10:00:10 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"',
  ];

  res.json({ logs: sampleLogs });
});

app.get('/api/sample-script', (req, res) => {
  const template = templateStore.getById('builtin-basic-url');
  res.json({ script: template?.code || '' });
});

app.get('/api/ws-info', (_req, res) => {
  res.json({
    clients: wsService.getClientCount(),
    endpoint: 'ws://localhost:3001/ws',
  });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../dist/client');
  app.use(express.static(clientDist));
  
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
