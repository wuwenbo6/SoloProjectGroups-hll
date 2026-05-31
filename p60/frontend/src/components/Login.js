import { useState } from 'react';
import axios from 'axios';
import { NTRU } from '../utils/crypto';

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const keyPair = await NTRU.generateKeyPair();
        
        const response = await axios.post('/api/register', {
          username,
          password,
          publicKey: keyPair.publicKey
        });

        if (response.data.success) {
          localStorage.setItem('privateKey', keyPair.privateKey);
          localStorage.setItem('publicKey', keyPair.publicKey);
          onLogin({
            userId: response.data.userId,
            username: response.data.username
          });
        }
      } else {
        const response = await axios.post('/api/login', {
          username,
          password
        });

        if (response.data.success) {
          onLogin({
            userId: response.data.userId,
            username: response.data.username
          });
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🔐 加密聊天</h1>
          <p>NTRU 后量子加密保护您的隐私</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <h2>{isRegister ? '注册账户' : '登录'}</h2>
          
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </div>
          
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          
          <button type="submit" disabled={loading} className="login-btn">
            {loading ? '处理中...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>
        
        <div className="toggle-mode">
          <span>{isRegister ? '已有账户？' : '没有账户？'}</span>
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="toggle-btn"
          >
            {isRegister ? '立即登录' : '立即注册'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
