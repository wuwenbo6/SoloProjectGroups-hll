import { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';
import { NTRU } from './utils/crypto';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [keyPair, setKeyPair] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('chatUser');
    const savedPrivateKey = localStorage.getItem('privateKey');
    const savedPublicKey = localStorage.getItem('publicKey');
    
    if (savedUser && savedPrivateKey && savedPublicKey) {
      setUser(JSON.parse(savedUser));
      setKeyPair({
        privateKey: savedPrivateKey,
        publicKey: savedPublicKey
      });
    }
  }, []);

  const handleLogin = async (userData) => {
    let pair = keyPair;
    
    if (!pair) {
      pair = await NTRU.generateKeyPair();
      localStorage.setItem('privateKey', pair.privateKey);
      localStorage.setItem('publicKey', pair.publicKey);
      setKeyPair(pair);
    }
    
    const userWithKey = { ...userData, publicKey: pair.publicKey };
    localStorage.setItem('chatUser', JSON.stringify(userWithKey));
    setUser(userWithKey);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatUser');
    localStorage.removeItem('privateKey');
    localStorage.removeItem('publicKey');
    setUser(null);
    setKeyPair(null);
  };

  return (
    <div className="app">
      {!user ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Chat user={user} keyPair={keyPair} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
