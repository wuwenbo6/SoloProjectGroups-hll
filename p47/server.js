const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Datastore = require('nedb');
const QRCode = require('qrcode');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const tagsDB = new Datastore({ filename: path.join(__dirname, 'data', 'tags.db'), autoload: true });
const templatesDB = new Datastore({ filename: path.join(__dirname, 'data', 'templates.db'), autoload: true });
const rulesDB = new Datastore({ filename: path.join(__dirname, 'data', 'rules.db'), autoload: true });

const defaultTemplates = [
  { id: 'url', name: 'URL链接', type: 'url', icon: '🔗', fields: [{ name: 'url', label: '网址', type: 'url' }] },
  { id: 'text', name: '纯文本', type: 'text', icon: '📝', fields: [{ name: 'text', label: '文本内容', type: 'text' }] },
  { id: 'bluetooth', name: '蓝牙配对', type: 'bluetooth', icon: '📶', fields: [{ name: 'mac', label: 'MAC地址', type: 'text' }] },
  { id: 'wifi', name: 'WiFi连接', type: 'wifi', icon: '📡', fields: [{ name: 'ssid', label: '网络名称', type: 'text' }, { name: 'password', label: '密码', type: 'text' }, { name: 'type', label: '加密类型', type: 'select', options: ['WPA', 'WEP', 'nopass'] }] },
  { id: 'vcard', name: '电子名片', type: 'vcard', icon: '👤', fields: [{ name: 'name', label: '姓名', type: 'text' }, { name: 'phone', label: '电话', type: 'tel' }, { name: 'email', label: '邮箱', type: 'email' }, { name: 'company', label: '公司', type: 'text' }] }
];

const defaultRules = [
  { id: 'light_on', name: '打开灯光', type: 'device', action: 'light_on', icon: '💡', description: '靠近NFC标签时打开灯光' },
  { id: 'light_off', name: '关闭灯光', type: 'device', action: 'light_off', icon: '🌙', description: '靠近NFC标签时关闭灯光' },
  { id: 'open_app', name: '打开应用', type: 'app', action: 'open_app', icon: '📱', description: '靠近NFC标签时打开指定应用' },
  { id: 'send_sms', name: '发送短信', type: 'communication', action: 'send_sms', icon: '💬', description: '靠近NFC标签时发送预设短信' },
  { id: 'set_wifi', name: '连接WiFi', type: 'network', action: 'set_wifi', icon: '📶', description: '靠近NFC标签时连接到指定WiFi' }
];

function initTemplates() {
  templatesDB.find({}, (err, docs) => {
    if (docs.length === 0) {
      templatesDB.insert(defaultTemplates);
    }
  });
}

function initRules() {
  rulesDB.find({}, (err, docs) => {
    if (docs.length === 0) {
      rulesDB.insert(defaultRules);
    }
  });
}

initTemplates();
initRules();

function encryptData(data, password) {
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  return {
    encrypted: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag,
    type: 'encrypted'
  };
}

function decryptData(encryptedData, password) {
  try {
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return { success: true, data: JSON.parse(decrypted) };
  } catch (error) {
    return { success: false, error: '解密失败，密码错误或数据已损坏' };
  }
}

app.get('/api/tags', (req, res) => {
  tagsDB.find({}).sort({ createdAt: -1 }).exec((err, docs) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(docs);
    }
  });
});

app.post('/api/tags', (req, res) => {
  const tag = {
    ...req.body,
    createdAt: new Date().toISOString()
  };
  tagsDB.insert(tag, (err, newDoc) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(newDoc);
    }
  });
});

app.delete('/api/tags/:id', (req, res) => {
  tagsDB.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: numRemoved > 0 });
    }
  });
});

app.get('/api/templates', (req, res) => {
  templatesDB.find({}, (err, docs) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(docs.length > 0 ? docs : defaultTemplates);
    }
  });
});

app.post('/api/encrypt', (req, res) => {
  try {
    const { data, password } = req.body;
    if (!data || !password) {
      return res.status(400).json({ error: '数据和密码不能为空' });
    }
    const encrypted = encryptData(data, password);
    res.json(encrypted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/decrypt', (req, res) => {
  try {
    const { encryptedData, password } = req.body;
    if (!encryptedData || !password) {
      return res.status(400).json({ error: '加密数据和密码不能为空' });
    }
    const result = decryptData(encryptedData, password);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rules', (req, res) => {
  rulesDB.find({}, (err, docs) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(docs.length > 0 ? docs : defaultRules);
    }
  });
});

app.post('/api/rules', (req, res) => {
  const rule = {
    ...req.body,
    createdAt: new Date().toISOString()
  };
  rulesDB.insert(rule, (err, newDoc) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(newDoc);
    }
  });
});

app.delete('/api/rules/:id', (req, res) => {
  rulesDB.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: numRemoved > 0 });
    }
  });
});

app.post('/api/rules/execute', (req, res) => {
  try {
    const { ruleId, params } = req.body;
    rulesDB.findOne({ _id: ruleId }, (err, rule) => {
      if (err || !rule) {
        return res.status(404).json({ error: '规则不存在' });
      }
      const executionResult = {
        success: true,
        rule: rule.name,
        action: rule.action,
        timestamp: new Date().toISOString(),
        message: `规则 "${rule.name}" 执行成功`,
        params: params || {}
      };
      res.json(executionResult);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/csv', (req, res) => {
  tagsDB.find({}).sort({ createdAt: -1 }).exec((err, docs) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const headers = ['ID', '类型', '数据', '创建时间'];
    const rows = docs.map(tag => [
      tag._id || '',
      tag.dataType || tag.type || 'unknown',
      `"${(tag.data || tag.content || '').toString().replace(/"/g, '""')}"`,
      tag.createdAt || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nfc_tags_history.csv"');
    res.write('\uFEFF');
    res.send(csvContent);
  });
});

app.post('/api/qrcode', async (req, res) => {
  try {
    const { data, options = {} } = req.body;
    const qrDataUrl = await QRCode.toDataURL(data, {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#ffffff'
      }
    });
    res.json({ qrCode: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/batch-qrcodes', async (req, res) => {
  try {
    const { items, options = {} } = req.body;
    const qrCodes = [];
    
    for (const item of items) {
      const qrDataUrl = await QRCode.toDataURL(item.data, {
        width: options.width || 300,
        margin: options.margin || 2
      });
      qrCodes.push({
        id: item.id,
        label: item.label,
        data: item.data,
        qrCode: qrDataUrl
      });
    }
    
    res.json({ qrCodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`NFC Manager PWA Server running on http://localhost:${PORT}`);
});
