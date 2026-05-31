const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery } = require('../database/db');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const users = await runQuery('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'your-secret-key-here',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
    res.json({ user: decoded });
  } catch (error) {
    res.status(401).json({ error: '无效的令牌' });
  }
});

module.exports = router;
