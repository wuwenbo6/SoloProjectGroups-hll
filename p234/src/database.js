const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ArchiveDatabase {
  constructor(dbPath) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initTables();
    this.initIndexes();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        with_user TEXT NOT NULL,
        with_server TEXT NOT NULL,
        thread TEXT,
        month TEXT NOT NULL,
        chat_type TEXT NOT NULL DEFAULT 'chat',
        room_name TEXT,
        start_time INTEGER NOT NULL,
        subject TEXT,
        UNIQUE(owner, with_user, with_server, thread, month, chat_type)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        utc_time INTEGER NOT NULL,
        body TEXT,
        direction TEXT NOT NULL,
        type TEXT,
        name TEXT,
        muc_nick TEXT,
        muc_jid TEXT,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS preferences (
        owner TEXT PRIMARY KEY,
        save TEXT DEFAULT 'body',
        expire INTEGER,
        otr TEXT DEFAULT 'approve'
      );
    `);
  }

  initIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner);
      CREATE INDEX IF NOT EXISTS idx_messages_collection_time ON messages(collection_id, utc_time);
      CREATE INDEX IF NOT EXISTS idx_messages_body ON messages(body);
    `);
  }

  getOrCreateCollection(owner, withJid, thread, startTime, subject = '', chatType = 'chat', roomName = '') {
    const ownerBare = this.getBareJid(owner);
    const withBare = this.getBareJid(withJid);
    const jidParts = this.parseJid(withBare);
    const month = this.getMonthString(startTime);
    
    let collection = this.db.prepare(`
      SELECT id FROM collections 
      WHERE owner = ? AND with_user = ? AND with_server = ? AND thread = ? AND month = ? AND chat_type = ?
    `).get(ownerBare, jidParts.user, jidParts.server, thread || '', month, chatType);

    if (!collection) {
      const result = this.db.prepare(`
        INSERT INTO collections (owner, with_user, with_server, thread, month, chat_type, room_name, start_time, subject)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ownerBare, jidParts.user, jidParts.server, thread || '', month, chatType, roomName, startTime, subject);
      return result.lastInsertRowid;
    }

    return collection.id;
  }

  addMessage(collectionId, utcTime, body, direction, type = 'chat', name = '', mucNick = '', mucJid = '') {
    return this.db.prepare(`
      INSERT INTO messages (collection_id, utc_time, body, direction, type, name, muc_nick, muc_jid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(collectionId, utcTime, body, direction, type, name, mucNick, mucJid);
  }

  archiveMessage(owner, fromJid, toJid, body, type = 'chat', timestamp = Date.now()) {
    const ownerBare = this.getBareJid(owner);
    const fromBare = this.getBareJid(fromJid);
    const toBare = this.getBareJid(toJid);
    
    const isFromOwner = fromBare === ownerBare;
    const withJid = isFromOwner ? toBare : fromBare;
    const direction = isFromOwner ? 'to' : 'from';
    
    const collectionId = this.getOrCreateCollection(ownerBare, withJid, '', timestamp, '', 'chat');
    
    return this.addMessage(collectionId, timestamp, body, direction, type, isFromOwner ? '' : this.parseJid(fromBare).user);
  }

  archiveMucMessage(owner, roomJid, fromNick, fromJid, body, type = 'groupchat', timestamp = Date.now()) {
    const ownerBare = this.getBareJid(owner);
    const roomBare = this.getBareJid(roomJid);
    const fromBare = fromJid ? this.getBareJid(fromJid) : '';
    
    const jidParts = this.parseJid(roomBare);
    const roomName = jidParts.user;
    
    const direction = fromBare === ownerBare ? 'to' : 'from';
    
    const collectionId = this.getOrCreateCollection(ownerBare, roomBare, '', timestamp, '', 'groupchat', roomName);
    
    return this.addMessage(
      collectionId, 
      timestamp, 
      body, 
      direction, 
      type, 
      fromNick,
      fromNick,
      fromBare
    );
  }

  listCollections(owner, options = {}) {
    const ownerBare = this.getBareJid(owner);
    
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM messages m WHERE m.collection_id = c.id) as message_count,
             (SELECT MAX(utc_time) FROM messages m WHERE m.collection_id = c.id) as last_activity
      FROM collections c 
      WHERE c.owner = ?
    `;
    const params = [ownerBare];

    if (options.with) {
      const withBare = this.getBareJid(options.with);
      const jidParts = this.parseJid(withBare);
      query += ` AND c.with_user = ? AND c.with_server = ?`;
      params.push(jidParts.user, jidParts.server);
    }

    if (options.chatType) {
      query += ` AND c.chat_type = ?`;
      params.push(options.chatType);
    }

    if (options.month) {
      query += ` AND c.month = ?`;
      params.push(options.month);
    }

    if (options.start) {
      query += ` AND c.start_time >= ?`;
      params.push(options.start);
    }

    if (options.end) {
      query += ` AND EXISTS (SELECT 1 FROM messages m WHERE m.collection_id = c.id AND m.utc_time <= ?)`;
      params.push(options.end);
    }

    query += ` ORDER BY c.month DESC, c.start_time DESC`;

    if (options.max) {
      query += ` LIMIT ?`;
      params.push(parseInt(options.max));
    }

    return this.db.prepare(query).all(...params);
  }

  retrieveCollection(owner, withJid, options = {}) {
    const ownerBare = this.getBareJid(owner);
    const withBare = this.getBareJid(withJid);
    const jidParts = this.parseJid(withBare);
    
    let query = `
      SELECT m.*, c.with_user, c.with_server, c.month, c.chat_type, c.room_name
      FROM messages m
      JOIN collections c ON m.collection_id = c.id
      WHERE c.owner = ? AND c.with_user = ? AND c.with_server = ?
    `;
    const params = [ownerBare, jidParts.user, jidParts.server];

    if (options.chatType) {
      query += ` AND c.chat_type = ?`;
      params.push(options.chatType);
    }

    if (options.month) {
      query += ` AND c.month = ?`;
      params.push(options.month);
    }

    if (options.start) {
      query += ` AND m.utc_time >= ?`;
      params.push(options.start);
    }

    if (options.end) {
      query += ` AND m.utc_time <= ?`;
      params.push(options.end);
    }

    if (options.keyword) {
      query += ` AND m.body LIKE ?`;
      params.push(`%${options.keyword}%`);
    }

    query += ` ORDER BY m.utc_time ASC`;

    if (options.max) {
      query += ` LIMIT ?`;
      params.push(parseInt(options.max));
    }

    return this.db.prepare(query).all(...params);
  }

  searchMessages(owner, keyword, options = {}) {
    const ownerBare = this.getBareJid(owner);
    
    let query = `
      SELECT m.*, c.with_user, c.with_server, c.thread, c.month, c.chat_type, c.room_name
      FROM messages m
      JOIN collections c ON m.collection_id = c.id
      WHERE c.owner = ? AND m.body LIKE ?
    `;
    const params = [ownerBare, `%${keyword}%`];

    if (options.chatType) {
      query += ` AND c.chat_type = ?`;
      params.push(options.chatType);
    }

    if (options.month) {
      query += ` AND c.month = ?`;
      params.push(options.month);
    }

    if (options.start) {
      query += ` AND m.utc_time >= ?`;
      params.push(options.start);
    }

    if (options.end) {
      query += ` AND m.utc_time <= ?`;
      params.push(options.end);
    }

    if (options.with) {
      const withBare = this.getBareJid(options.with);
      const jidParts = this.parseJid(withBare);
      query += ` AND c.with_user = ? AND c.with_server = ?`;
      params.push(jidParts.user, jidParts.server);
    }

    query += ` ORDER BY m.utc_time DESC`;

    if (options.max) {
      query += ` LIMIT ?`;
      params.push(parseInt(options.max));
    }

    return this.db.prepare(query).all(...params);
  }

  exportToHtml(owner, options = {}) {
    const ownerBare = this.getBareJid(owner);
    
    const title = options.title || `${ownerBare} 的消息记录`;
    const now = new Date().toLocaleString('zh-CN');
    
    let collections = [];
    if (options.with) {
      const messages = this.retrieveCollection(ownerBare, options.with, options);
      if (messages.length > 0) {
        collections.push({
          with_user: messages[0].with_user,
          with_server: messages[0].with_server,
          chat_type: messages[0].chat_type || 'chat',
          room_name: messages[0].room_name,
          month: options.month,
          messages: messages
        });
      }
    } else {
      const collectionList = this.listCollections(ownerBare, options);
      for (const col of collectionList) {
        const messages = this.retrieveCollection(ownerBare, `${col.with_user}@${col.with_server}`, {
          month: col.month,
          chatType: col.chat_type
        });
        collections.push({ ...col, messages });
      }
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px 32px;
        }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header p { opacity: 0.9; font-size: 13px; }
        .collection {
            border-bottom: 1px solid #eee;
        }
        .collection-header {
            background: #f8f9fa;
            padding: 16px 32px;
            border-bottom: 1px solid #eee;
        }
        .collection-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
        }
        .collection-meta {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }
        .messages {
            padding: 20px 32px;
        }
        .message {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 16px;
            margin-bottom: 12px;
        }
        .message.from {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin-right: auto;
            border-bottom-left-radius: 4px;
        }
        .message.to {
            background: #e9ecef;
            color: #333;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        .message-body {
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 4px;
            word-wrap: break-word;
        }
        .message-meta {
            font-size: 11px;
            opacity: 0.8;
        }
        .muc-nick {
            font-weight: 600;
            margin-right: 8px;
        }
        .system-message {
            text-align: center;
            color: #999;
            font-size: 12px;
            padding: 12px;
        }
        .export-footer {
            text-align: center;
            padding: 16px;
            color: #999;
            font-size: 12px;
            background: #f8f9fa;
        }
        .month-group {
            background: #fff3cd;
            color: #856404;
            padding: 8px 32px;
            font-size: 12px;
            font-weight: 600;
        }
        .chat-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            margin-left: 8px;
        }
        .badge-chat { background: #d4edda; color: #155724; }
        .badge-groupchat { background: #cce5ff; color: #004085; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💬 ${title}</h1>
            <p>导出时间: ${now} | 共 ${collections.length} 个会话</p>
        </div>
        ${this.renderCollectionsHtml(collections, ownerBare)}
        <div class="export-footer">
            由 XMPP 消息归档系统生成 | XEP-0136
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  renderCollectionsHtml(collections, ownerBare) {
    if (collections.length === 0) {
      return '<div class="system-message">暂无消息记录</div>';
    }

    let html = '';
    let currentMonth = '';

    for (const col of collections) {
      const withJid = `${col.with_user}@${col.with_server}`;
      const isGroupChat = col.chat_type === 'groupchat';
      const title = isGroupChat ? (col.room_name || withJid) : withJid;
      const badgeClass = isGroupChat ? 'badge-groupchat' : 'badge-chat';
      const badgeText = isGroupChat ? '群聊' : '单聊';
      
      if (col.month !== currentMonth) {
        currentMonth = col.month;
        html += `<div class="month-group">📅 ${currentMonth}</div>`;
      }

      html += `
        <div class="collection">
            <div class="collection-header">
                <span class="collection-title">
                    ${isGroupChat ? '👥' : '👤'} ${title}
                    <span class="chat-badge ${badgeClass}">${badgeText}</span>
                </span>
                <div class="collection-meta">
                    ${col.message_count || col.messages?.length || 0} 条消息
                </div>
            </div>
            <div class="messages">
                ${this.renderMessagesHtml(col.messages || [], ownerBare, isGroupChat)}
            </div>
        </div>`;
    }

    return html;
  }

  renderMessagesHtml(messages, ownerBare, isGroupChat = false) {
    if (!messages || messages.length === 0) {
      return '<div class="system-message">暂无消息</div>';
    }

    return messages.map(m => {
      const date = new Date(m.utc_time).toLocaleString('zh-CN');
      const isFromOwner = m.direction === 'to';
      const senderName = isGroupChat 
        ? (m.muc_nick || m.name || '未知用户')
        : (isFromOwner ? '我' : (m.name || m.with_user));
      
      const body = this.escapeHtml(m.body || '');
      
      return `
        <div class="message ${m.direction}">
            <div class="message-body">
                ${isGroupChat && !isFromOwner ? `<span class="muc-nick">${senderName}:</span>` : ''}
                ${body}
            </div>
            <div class="message-meta">
                ${isFromOwner ? '我' : senderName} · ${date}
            </div>
        </div>`;
    }).join('');
  }

  escapeHtml(text) {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  removeCollection(owner, withJid, month = null) {
    const ownerBare = this.getBareJid(owner);
    const withBare = this.getBareJid(withJid);
    const jidParts = this.parseJid(withBare);
    
    let query = `
      DELETE FROM collections 
      WHERE owner = ? AND with_user = ? AND with_server = ?
    `;
    const params = [ownerBare, jidParts.user, jidParts.server];

    if (month) {
      query += ` AND month = ?`;
      params.push(month);
    }

    return this.db.prepare(query).run(...params);
  }

  getPreferences(owner) {
    const ownerBare = this.getBareJid(owner);
    return this.db.prepare(`SELECT * FROM preferences WHERE owner = ?`).get(ownerBare);
  }

  setPreferences(owner, prefs) {
    const ownerBare = this.getBareJid(owner);
    return this.db.prepare(`
      INSERT OR REPLACE INTO preferences (owner, save, expire, otr)
      VALUES (?, ?, ?, ?)
    `).run(ownerBare, prefs.save || 'body', prefs.expire || null, prefs.otr || 'approve');
  }

  parseJid(jid) {
    const parts = jid.split('@');
    const user = parts[0];
    const rest = parts[1] || '';
    const serverParts = rest.split('/');
    return {
      user: user,
      server: serverParts[0],
      resource: serverParts[1] || ''
    };
  }

  getBareJid(jid) {
    if (!jid) return jid;
    const parts = jid.split('/');
    return parts[0];
  }

  getMonthString(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  close() {
    this.db.close();
  }
}

module.exports = ArchiveDatabase;
