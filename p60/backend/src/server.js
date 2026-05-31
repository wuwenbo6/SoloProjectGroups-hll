const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const { encryptMessage, decryptMessage, generateKeyPair, encapsulateSecret, decapsulateSecret } = require('./crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const db = initDB();

const userSockets = new Map();
const groupKeys = new Map();

app.post('/api/register', (req, res) => {
  const { username, password, publicKey } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const stmt = db.prepare('INSERT INTO users (username, password_hash, public_key) VALUES (?, ?, ?)');
    const result = stmt.run(username, password, publicKey);
    
    res.json({ 
      success: true, 
      userId: result.lastInsertRowid,
      username,
      publicKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ 
      success: true, 
      userId: user.id,
      username: user.username,
      publicKey: user.public_key
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, public_key FROM users').all();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups', (req, res) => {
  try {
    const groups = db.prepare('SELECT * FROM groups').all();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups', (req, res) => {
  const { name, createdBy } = req.body;
  
  try {
    const stmt = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)');
    const result = stmt.run(name, createdBy);
    
    const groupId = result.lastInsertRowid;
    const memberStmt = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    memberStmt.run(groupId, createdBy);
    
    res.json({ success: true, groupId, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups/:groupId/members', (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;
  
  try {
    const stmt = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    stmt.run(groupId, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:groupId/members', (req, res) => {
  const { groupId } = req.params;
  
  try {
    const members = db.prepare(`
      SELECT u.id, u.username, u.public_key 
      FROM users u 
      JOIN group_members gm ON u.id = gm.user_id 
      WHERE gm.group_id = ?
    `).all(groupId);
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:chatType/:chatId', (req, res) => {
  const { chatType, chatId } = req.params;
  const { userId } = req.query;
  
  try {
    let messages;
    if (chatType === 'private') {
      messages = db.prepare(`
        SELECT m.*, u.username as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_type = 'private' 
          AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
        ORDER BY m.created_at ASC
      `).all(userId, chatId, chatId, userId);
    } else {
      messages = db.prepare(`
        SELECT m.*, u.username as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_type = 'group' AND m.group_id = ?
        ORDER BY m.created_at ASC
      `).all(chatId);
    }
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/:messageId/read', (req, res) => {
  const { messageId } = req.params;
  const { userId } = req.body;
  
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO read_receipts (message_id, user_id) VALUES (?, ?)');
    stmt.run(messageId, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register_user', (userId) => {
    userSockets.set(userId.toString(), socket.id);
    socket.userId = userId;
    console.log('User registered:', userId);
  });

  socket.on('private_message', async (data) => {
    const { senderId, recipientId, encryptedContent, iv, encryptedKey, messageType = 'text', fileName, fileType, fileSize, keyId } = data;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO messages (sender_id, recipient_id, chat_type, message_type, encrypted_content, iv, encrypted_key, file_name, file_type, file_size, key_id)
        VALUES (?, ?, 'private', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(senderId, recipientId, messageType, encryptedContent, iv, encryptedKey, fileName || null, fileType || null, fileSize || null, keyId || null);
      
      const message = {
        id: result.lastInsertRowid,
        sender_id: senderId,
        recipient_id: recipientId,
        chat_type: 'private',
        message_type: messageType,
        encrypted_content: encryptedContent,
        iv,
        encrypted_key: encryptedKey,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        key_id: keyId,
        created_at: new Date().toISOString(),
        sender_name: data.senderName
      };

      const recipientSocketId = userSockets.get(recipientId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('private_message', message);
      }
      
      socket.emit('message_sent', { messageId: result.lastInsertRowid });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('key_rotate', async (data) => {
    const { senderId, recipientId, groupId, encryptedKey, iv, ephemeralKey, newKeyId, chatType } = data;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO messages (sender_id, recipient_id, group_id, chat_type, message_type, encrypted_content, iv, encrypted_key, key_id)
        VALUES (?, ?, ?, ?, 'key_rotate', ?, ?, ?, ?)
      `);
      const result = stmt.run(
        senderId, 
        chatType === 'private' ? recipientId : null, 
        chatType === 'group' ? groupId : null, 
        chatType,
        ephemeralKey,
        iv,
        encryptedKey,
        newKeyId
      );
      
      const message = {
        id: result.lastInsertRowid,
        sender_id: senderId,
        chat_type: chatType,
        message_type: 'key_rotate',
        encrypted_content: ephemeralKey,
        iv,
        encrypted_key: encryptedKey,
        key_id: newKeyId,
        created_at: new Date().toISOString(),
        sender_name: data.senderName
      };

      if (chatType === 'private') {
        const recipientSocketId = userSockets.get(recipientId.toString());
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('key_rotate', message);
        }
      } else {
        const members = db.prepare(`
          SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?
        `).all(groupId, senderId);

        members.forEach(member => {
          const memberSocketId = userSockets.get(member.user_id.toString());
          if (memberSocketId) {
            io.to(memberSocketId).emit('key_rotate', { ...message, group_id: groupId });
          }
        });
      }
      
      console.log(`密钥轮换消息已发送: ${newKeyId}`);
    } catch (error) {
      console.error('Error sending key rotation:', error);
    }
  });

  socket.on('group_message', async (data) => {
    const { senderId, groupId, encryptedContent, iv, encryptedGroupKey, senderName, messageType = 'text', fileName, fileType, fileSize, keyId } = data;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO messages (sender_id, group_id, chat_type, message_type, encrypted_content, iv, encrypted_key, file_name, file_type, file_size, key_id)
        VALUES (?, ?, 'group', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(senderId, groupId, messageType, encryptedContent, iv, encryptedGroupKey, fileName || null, fileType || null, fileSize || null, keyId || null);
      
      const message = {
        id: result.lastInsertRowid,
        sender_id: senderId,
        group_id: groupId,
        chat_type: 'group',
        message_type: messageType,
        encrypted_content: encryptedContent,
        iv,
        encrypted_key: encryptedGroupKey,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        key_id: keyId,
        created_at: new Date().toISOString(),
        sender_name: senderName
      };

      const members = db.prepare(`
        SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?
      `).all(groupId, senderId);

      members.forEach(member => {
        const memberSocketId = userSockets.get(member.user_id.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit('group_message', message);
        }
      });
      
      socket.emit('message_sent', { messageId: result.lastInsertRowid });
    } catch (error) {
      console.error('Error saving group message:', error);
    }
  });

  socket.on('message_read', (data) => {
    const { messageId, userId, chatType, chatId } = data;
    
    try {
      const stmt = db.prepare('INSERT OR IGNORE INTO read_receipts (message_id, user_id) VALUES (?, ?)');
      stmt.run(messageId, userId);

      if (chatType === 'private') {
        const senderSocketId = userSockets.get(chatId.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit('read_receipt', { messageId, userId });
        }
      } else {
        const members = db.prepare(`
          SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?
        `).all(chatId, userId);

        members.forEach(member => {
          const memberSocketId = userSockets.get(member.user_id.toString());
          if (memberSocketId) {
            io.to(memberSocketId).emit('read_receipt', { messageId, userId });
          }
        });
      }
    } catch (error) {
      console.error('Error saving read receipt:', error);
    }
  });

  socket.on('typing', (data) => {
    const { chatType, chatId, userId, username, isTyping } = data;
    
    if (chatType === 'private') {
      const recipientSocketId = userSockets.get(chatId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('typing', { userId, username, isTyping });
      }
    } else {
      const members = db.prepare(`
        SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?
      `).all(chatId, userId);

      members.forEach(member => {
        const memberSocketId = userSockets.get(member.user_id.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit('typing', { userId, username, isTyping, groupId: chatId });
        }
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId.toString());
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
