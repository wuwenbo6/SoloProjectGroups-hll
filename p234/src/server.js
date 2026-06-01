require('dotenv').config();

const component = require('@xmpp/component');
const xml = require('@xmpp/xml');
const ArchiveDatabase = require('./database');
const XEP0136Handler = require('./xep0136');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const {
  XMPP_SERVICE,
  XMPP_PORT,
  XMPP_DOMAIN,
  XMPP_SECRET,
  DB_PATH,
  HTTP_PORT,
  WS_PORT
} = process.env;

const db = new ArchiveDatabase(DB_PATH);
const xep0136 = new XEP0136Handler(db);

const xmpp = component({
  service: `xmpp://${XMPP_SERVICE}:${XMPP_PORT}`,
  domain: XMPP_DOMAIN,
  password: XMPP_SECRET,
});

xmpp.on('error', err => {
  console.error('XMPP Error:', err);
});

xmpp.on('offline', () => {
  console.log('XMPP Component: Offline');
});

xmpp.on('stanza', async stanza => {
  console.log('Received stanza:', stanza.toString());

  const response = xep0136.handleStanza(stanza);
  if (response) {
    console.log('Sending response:', response.toString());
    xmpp.send(response);
  }
});

xmpp.on('online', async address => {
  console.log('XMPP Component: Online as', address.toString());

  xmpp.send(xml('presence', { type: 'available' }));
});

xmpp.start().catch(console.error);

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/collections/:owner', (req, res) => {
  const { owner } = req.params;
  const { with: withJid, month, start, end, max, chatType } = req.query;
  
  const collections = db.listCollections(owner, {
    with: withJid,
    month,
    chatType,
    start: start ? parseInt(start) : null,
    end: end ? parseInt(end) : null,
    max: max ? parseInt(max) : 50
  });
  
  res.json(collections);
});

app.get('/api/messages/:owner', (req, res) => {
  const { owner } = req.params;
  const { with: withJid, month, start, end, keyword, max, chatType } = req.query;
  
  if (!withJid) {
    return res.status(400).json({ error: 'with parameter is required' });
  }
  
  const messages = db.retrieveCollection(owner, withJid, {
    month,
    chatType,
    start: start ? parseInt(start) : null,
    end: end ? parseInt(end) : null,
    keyword,
    max: max ? parseInt(max) : 100
  });
  
  res.json(messages);
});

app.get('/api/search/:owner', (req, res) => {
  const { owner } = req.params;
  const { keyword, with: withJid, month, start, end, max, chatType } = req.query;
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword parameter is required' });
  }
  
  const messages = db.searchMessages(owner, keyword, {
    with: withJid,
    month,
    chatType,
    start: start ? parseInt(start) : null,
    end: end ? parseInt(end) : null,
    max: max ? parseInt(max) : 100
  });
  
  res.json(messages);
});

app.get('/api/export/:owner', (req, res) => {
  const { owner } = req.params;
  const { with: withJid, month, start, end, chatType, title } = req.query;
  
  const options = {
    month,
    chatType,
    start: start ? parseInt(start) : null,
    end: end ? parseInt(end) : null,
    title
  };
  
  if (withJid) {
    options.with = withJid;
  }
  
  const html = db.exportToHtml(owner, options);
  
  const filename = `messages_${owner.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.html`;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(html);
});

app.post('/api/messages', (req, res) => {
  const { from, to, body, type } = req.body;
  
  if (!from || !to || !body) {
    return res.status(400).json({ error: 'from, to, and body are required' });
  }
  
  db.archiveMessage(from, from, to, body, type || 'chat');
  db.archiveMessage(to, from, to, body, type || 'chat');
  
  broadcastToWebSocket({
    type: 'message',
    data: { from, to, body, timestamp: Date.now() }
  });
  
  res.json({ success: true });
});

app.post('/api/muc/messages', (req, res) => {
  const { owner, room, fromNick, fromJid, body, type } = req.body;
  
  if (!owner || !room || !fromNick || !body) {
    return res.status(400).json({ error: 'owner, room, fromNick, and body are required' });
  }
  
  const result = db.archiveMucMessage(owner, room, fromNick, fromJid || '', body, type || 'groupchat');
  
  broadcastToWebSocket({
    type: 'muc_message',
    data: { owner, room, fromNick, fromJid, body, timestamp: Date.now() }
  });
  
  res.json({ success: true, id: result.lastInsertRowid });
});

const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });

const clients = new Set();

wss.on('connection', ws => {
  console.log('WebSocket client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected');
  });
  
  ws.on('message', data => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
});

function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'archive':
      const { from, to, body, type } = message.data;
      db.archiveMessage(from, from, to, body, type || 'chat');
      db.archiveMessage(to, from, to, body, type || 'chat');
      ws.send(JSON.stringify({ type: 'archived', success: true }));
      break;

    case 'archiveMuc':
      const { owner, room, fromNick, fromJid, body: mucBody, type: mucType } = message.data;
      db.archiveMucMessage(owner, room, fromNick, fromJid || '', mucBody, mucType || 'groupchat');
      ws.send(JSON.stringify({ type: 'archived', success: true }));
      break;
      
    case 'listCollections':
      const collections = db.listCollections(message.data.owner, message.data.options || {});
      ws.send(JSON.stringify({ type: 'collections', data: collections }));
      break;
      
    case 'retrieveCollection':
      const messages = db.retrieveCollection(
        message.data.owner,
        message.data.with,
        message.data.options || {}
      );
      ws.send(JSON.stringify({ type: 'messages', data: messages }));
      break;
      
    case 'search':
      const results = db.searchMessages(
        message.data.owner,
        message.data.keyword,
        message.data.options || {}
      );
      ws.send(JSON.stringify({ type: 'searchResults', data: results }));
      break;

    case 'export':
      const html = db.exportToHtml(message.data.owner, message.data.options || {});
      ws.send(JSON.stringify({ type: 'exportResult', data: html }));
      break;
  }
}

function broadcastToWebSocket(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP API server running on http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket server running on ws://localhost:${HTTP_PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
