const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        master: null,
        agents: new Set(),
        clients: new Map()
      });
    }
    socket.join(roomId);
    socket.emit('room-created', roomId);
    console.log('Room created:', roomId);
  });

  socket.on('join-room', (roomId, role) => {
    if (!rooms.has(roomId)) {
      socket.emit('error', 'Room does not exist');
      return;
    }

    const room = rooms.get(roomId);
    socket.join(roomId);

    if (role === 'master') {
      room.master = socket.id;
      room.clients.set(socket.id, { role, socket });
      socket.emit('joined-room', { roomId, role });
      socket.to(roomId).emit('master-connected');
      console.log('Master joined room:', roomId);
    } else if (role === 'agent') {
      room.agents.add(socket.id);
      room.clients.set(socket.id, { role, socket });
      socket.emit('joined-room', { roomId, role });
      if (room.master) {
        io.to(room.master).emit('agent-connected', socket.id);
      }
      console.log('Agent joined room:', roomId, 'Total agents:', room.agents.size);
    }
  });

  socket.on('offer', (data) => {
    const { targetId, offer, roomId } = data;
    if (rooms.has(roomId)) {
      socket.to(targetId).emit('offer', {
        offer,
        from: socket.id,
        roomId
      });
    }
  });

  socket.on('answer', (data) => {
    const { targetId, answer, roomId } = data;
    if (rooms.has(roomId)) {
      socket.to(targetId).emit('answer', {
        answer,
        from: socket.id
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetId, candidate, roomId } = data;
    if (rooms.has(roomId)) {
      socket.to(targetId).emit('ice-candidate', {
        candidate,
        from: socket.id
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    rooms.forEach((room, roomId) => {
      if (room.master === socket.id) {
        room.master = null;
        socket.to(roomId).emit('master-disconnected');
      }
      
      if (room.agents.has(socket.id)) {
        room.agents.delete(socket.id);
        if (room.master) {
          io.to(room.master).emit('agent-disconnected', socket.id);
        }
      }
      
      room.clients.delete(socket.id);
      
      if (room.master === null && room.agents.size === 0) {
        rooms.delete(roomId);
        console.log('Room deleted:', roomId);
      }
    });
  });

  socket.on('get-agents', (roomId) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      socket.emit('agents-list', Array.from(room.agents));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});