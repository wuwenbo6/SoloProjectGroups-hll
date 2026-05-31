import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import { NTRU, encryptMessage, decryptMessage, generateSymmetricKey, encryptWithSymmetricKey, decryptWithSymmetricKey, encryptKeyWithPublicKey, decryptKeyWithPrivateKey, forwardSecrecyManager, encryptFile, decryptFile, downloadFile } from '../utils/crypto';

function Chat({ user, keyPair, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [readReceipts, setReadReceipts] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [sharedSecrets, setSharedSecrets] = useState({});
  const [groupKeys, setGroupKeys] = useState({});
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.emit('register_user', user.userId);

    newSocket.on('private_message', (message) => {
      if (message.message_type === 'key_rotate') {
        handleKeyRotateMessage(message);
      } else if (activeChat?.type === 'private' && activeChat?.id === message.sender_id) {
        setMessages(prev => [...prev, message]);
        decryptAndStoreMessage(message);
        sendReadReceipt(message.id);
      }
    });

    newSocket.on('group_message', (message) => {
      if (message.message_type === 'key_rotate') {
        handleKeyRotateMessage(message);
      } else if (activeChat?.type === 'group' && activeChat?.id === message.group_id) {
        setMessages(prev => [...prev, message]);
        decryptAndStoreMessage(message);
        sendReadReceipt(message.id);
      }
    });

    newSocket.on('key_rotate', (message) => {
      handleKeyRotateMessage(message);
    });

    newSocket.on('read_receipt', ({ messageId, userId }) => {
      setReadReceipts(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), userId]
      }));
    });

    newSocket.on('typing', (data) => {
      if (data.groupId) {
        if (activeChat?.type === 'group' && activeChat?.id === data.groupId) {
          setTypingUsers(prev => ({
            ...prev,
            [data.userId]: data.isTyping ? data.username : null
          }));
        }
      } else {
        if (activeChat?.type === 'private' && activeChat?.id === data.userId) {
          setTypingUsers(prev => ({
            ...prev,
            [data.userId]: data.isTyping ? data.username : null
          }));
        }
      }
    });

    forwardSecrecyManager.onKeyRotate = (peerId, rotationData) => {
      sendKeyRotation(peerId, rotationData);
    };

    loadUsers();
    loadGroups();

    return () => {
      newSocket.close();
      forwardSecrecyManager.clear();
    };
  }, [user.userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendKeyRotation = (peerId, rotationData) => {
    if (!socket) return;

    const isGroup = typeof peerId === 'string' && peerId.startsWith('group_');
    
    if (isGroup) {
      const groupId = parseInt(peerId.replace('group_', ''));
      socket.emit('key_rotate', {
        senderId: user.userId,
        groupId,
        chatType: 'group',
        ephemeralKey: rotationData.ephemeralKey,
        encryptedKey: '',
        iv: '',
        newKeyId: rotationData.newKeyId,
        senderName: user.username
      });
    } else {
      socket.emit('key_rotate', {
        senderId: user.userId,
        recipientId: parseInt(peerId),
        chatType: 'private',
        ephemeralKey: rotationData.ephemeralKey,
        encryptedKey: '',
        iv: '',
        newKeyId: rotationData.newKeyId,
        senderName: user.username
      });
    }
  };

  const handleKeyRotateMessage = async (message) => {
    if (message.sender_id === user.userId) return;

    try {
      const peerId = message.chat_type === 'group' 
        ? `group_${message.group_id}` 
        : message.sender_id;

      const newKey = await NTRU.decapsulate(message.encrypted_content, keyPair.privateKey);
      
      if (message.chat_type === 'group') {
        setGroupKeys(prev => ({ ...prev, [message.group_id]: newKey }));
      } else {
        setSharedSecrets(prev => ({ ...prev, [message.sender_id]: newKey }));
      }

      if (activeChat && (
        (message.chat_type === 'private' && activeChat.id === message.sender_id) ||
        (message.chat_type === 'group' && activeChat.id === message.group_id)
      )) {
        setMessages(prev => [...prev, { ...message, message_type: 'key_rotate' }]);
      }

      console.log(`密钥轮换已应用: ${message.key_id}`);
    } catch (error) {
      console.error('处理密钥轮换失败:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data.filter(u => u.id !== user.userId));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await axios.get('/api/groups');
      setGroups(response.data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const getOrCreateSharedSecret = async (recipientId, recipientPublicKey) => {
    const cacheKey = `peer_${recipientId}`;
    
    if (forwardSecrecyManager.hasSession(cacheKey)) {
      return forwardSecrecyManager.getCurrentKey(cacheKey);
    }

    if (sharedSecrets[recipientId]) {
      return sharedSecrets[recipientId];
    }

    const { ciphertext, sharedSecret } = await NTRU.encapsulate(recipientPublicKey);
    await forwardSecrecyManager.initSession(cacheKey, sharedSecret, recipientPublicKey);
    setSharedSecrets(prev => ({ ...prev, [recipientId]: sharedSecret }));
    
    return sharedSecret;
  };

  const decryptAndStoreMessage = async (message) => {
    if (message.message_type === 'key_rotate') {
      return;
    }

    try {
      let decrypted;
      
      if (message.chat_type === 'private') {
        const otherUserId = message.sender_id === user.userId ? message.recipient_id : message.sender_id;
        let sharedSecret = sharedSecrets[otherUserId];
        
        if (!sharedSecret && message.encrypted_key) {
          try {
            const keyData = JSON.parse(message.encrypted_key);
            if (keyData.epk) {
              sharedSecret = await NTRU.decapsulate(keyData.epk, keyPair.privateKey);
              setSharedSecrets(prev => ({ ...prev, [otherUserId]: sharedSecret }));
            }
          } catch (e) {
          }
        }

        if (sharedSecret) {
          if (message.message_type === 'file') {
            decrypted = 'FILE';
          } else {
            decrypted = await decryptMessage({
              c: message.encrypted_content,
              iv: message.iv
            }, sharedSecret);
          }
        }
      } else {
        const groupId = message.group_id;
        let groupKey = groupKeys[groupId];
        
        if (!groupKey && message.encrypted_key) {
          try {
            const keyData = JSON.parse(message.encrypted_key);
            if (keyData.epk) {
              groupKey = await decryptKeyWithPrivateKey(keyData, keyPair.privateKey);
              setGroupKeys(prev => ({ ...prev, [groupId]: groupKey }));
            }
          } catch (e) {
          }
        }

        if (groupKey) {
          if (message.message_type === 'file') {
            decrypted = 'FILE';
          } else {
            decrypted = await decryptWithSymmetricKey({
              c: message.encrypted_content,
              iv: message.iv
            }, groupKey);
          }
        }
      }

      if (decrypted) {
        setDecryptedMessages(prev => ({
          ...prev,
          [message.id]: decrypted
        }));
      }
    } catch (error) {
      console.error('Error decrypting message:', error);
    }
  };

  const sendReadReceipt = (messageId) => {
    if (socket && activeChat) {
      socket.emit('message_read', {
        messageId,
        userId: user.userId,
        chatType: activeChat.type,
        chatId: activeChat.id
      });
    }
  };

  const selectChat = async (chat) => {
    setActiveChat(chat);
    setMessages([]);
    setDecryptedMessages({});
    setReadReceipts({});

    try {
      const response = await axios.get(`/api/messages/${chat.type}/${chat.id}?userId=${user.userId}`);
      setMessages(response.data);

      for (const message of response.data) {
        await decryptAndStoreMessage(message);
        if (message.sender_id !== user.userId && message.message_type !== 'key_rotate') {
          sendReadReceipt(message.id);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async (content) => {
    if (!socket || !activeChat || !content.trim()) return;

    try {
      if (activeChat.type === 'private') {
        const recipientUser = users.find(u => u.id === activeChat.id);
        if (!recipientUser) return;

        const sharedSecret = await getOrCreateSharedSecret(activeChat.id, recipientUser.public_key);
        
        const encrypted = await encryptMessage(content, sharedSecret);
        const keyData = { epk: (await NTRU.encapsulate(recipientUser.public_key)).ciphertext };
        const encryptedKey = JSON.stringify(keyData);

        socket.emit('private_message', {
          senderId: user.userId,
          recipientId: activeChat.id,
          encryptedContent: encrypted.c,
          iv: encrypted.iv,
          encryptedKey,
          senderName: user.username,
          messageType: 'text'
        });

        const cacheKey = `peer_${activeChat.id}`;
        forwardSecrecyManager.incrementMessageCount(cacheKey);
      } else {
        let groupKey = groupKeys[activeChat.id];
        
        if (!groupKey) {
          groupKey = generateSymmetricKey();
          setGroupKeys(prev => ({ ...prev, [activeChat.id]: groupKey }));
        }

        const encrypted = await encryptWithSymmetricKey(content, groupKey);
        
        const members = await axios.get(`/api/groups/${activeChat.id}/members`);
        let encryptedGroupKey = '';
        
        for (const member of members.data) {
          if (member.id !== user.userId) {
            const keyData = await encryptKeyWithPublicKey(groupKey, member.public_key);
            encryptedGroupKey = JSON.stringify(keyData);
            break;
          }
        }

        socket.emit('group_message', {
          senderId: user.userId,
          groupId: activeChat.id,
          encryptedContent: encrypted.c,
          iv: encrypted.iv,
          encryptedGroupKey,
          senderName: user.username,
          messageType: 'text'
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const sendFile = async (file) => {
    if (!socket || !activeChat) return;

    try {
      if (activeChat.type === 'private') {
        const recipientUser = users.find(u => u.id === activeChat.id);
        if (!recipientUser) return;

        const sharedSecret = await getOrCreateSharedSecret(activeChat.id, recipientUser.public_key);
        
        const encryptedFile = await encryptFile(file, sharedSecret);
        const keyData = { epk: (await NTRU.encapsulate(recipientUser.public_key)).ciphertext };
        const encryptedKey = JSON.stringify(keyData);

        socket.emit('private_message', {
          senderId: user.userId,
          recipientId: activeChat.id,
          encryptedContent: encryptedFile.data,
          iv: encryptedFile.iv,
          encryptedKey,
          senderName: user.username,
          messageType: 'file',
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        });

        alert('文件已加密发送！');
      } else {
        let groupKey = groupKeys[activeChat.id];
        
        if (!groupKey) {
          groupKey = generateSymmetricKey();
          setGroupKeys(prev => ({ ...prev, [activeChat.id]: groupKey }));
        }

        const encryptedFile = await encryptFile(file, groupKey);
        
        const members = await axios.get(`/api/groups/${activeChat.id}/members`);
        let encryptedGroupKey = '';
        
        for (const member of members.data) {
          if (member.id !== user.userId) {
            const keyData = await encryptKeyWithPublicKey(groupKey, member.public_key);
            encryptedGroupKey = JSON.stringify(keyData);
            break;
          }
        }

        socket.emit('group_message', {
          senderId: user.userId,
          groupId: activeChat.id,
          encryptedContent: encryptedFile.data,
          iv: encryptedFile.iv,
          encryptedGroupKey,
          senderName: user.username,
          messageType: 'file',
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        });

        alert('文件已加密发送！');
      }
    } catch (error) {
      console.error('Error sending file:', error);
      alert('文件发送失败: ' + error.message);
    }
  };

  const handleFileDownload = async (message) => {
    try {
      let decryptionKey;
      
      if (message.chat_type === 'private') {
        const otherUserId = message.sender_id === user.userId ? message.recipient_id : message.sender_id;
        decryptionKey = sharedSecrets[otherUserId];
      } else {
        decryptionKey = groupKeys[message.group_id];
      }

      if (!decryptionKey) {
        alert('无法获取解密密钥，请确保您有权限');
        return;
      }

      const encryptedData = {
        data: message.encrypted_content,
        iv: message.iv,
        type: message.file_type
      };

      const blob = await decryptFile(encryptedData, decryptionKey);
      downloadFile(blob, message.file_name || 'downloaded_file', message.file_type);
      
      alert('文件已解密并下载！');
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('文件解密失败: ' + error.message);
    }
  };

  const handleTyping = (isTyping) => {
    if (socket && activeChat) {
      socket.emit('typing', {
        chatType: activeChat.type,
        chatId: activeChat.id,
        userId: user.userId,
        username: user.username,
        isTyping
      });
    }
  };

  const createGroup = async (groupName, memberIds) => {
    try {
      const response = await axios.post('/api/groups', {
        name: groupName,
        createdBy: user.userId
      });

      const groupId = response.data.groupId;

      for (const memberId of memberIds) {
        await axios.post(`/api/groups/${groupId}/members`, { userId: memberId });
      }

      loadGroups();
      return groupId;
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const getFileDecryptionKey = () => {
    if (!activeChat) return null;
    if (activeChat.type === 'private') {
      return sharedSecrets[activeChat.id];
    }
    return groupKeys[activeChat.id];
  };

  return (
    <div className="chat-container">
      <Sidebar
        user={user}
        users={users}
        groups={groups}
        activeChat={activeChat}
        onSelectChat={selectChat}
        onCreateGroup={createGroup}
        onLogout={onLogout}
      />
      <ChatWindow
        user={user}
        activeChat={activeChat}
        messages={messages}
        decryptedMessages={decryptedMessages}
        readReceipts={readReceipts}
        typingUsers={typingUsers}
        onSendMessage={sendMessage}
        onSendFile={sendFile}
        onFileDownload={handleFileDownload}
        onTyping={handleTyping}
        messagesEndRef={messagesEndRef}
        fileDecryptionKey={getFileDecryptionKey()}
      />
    </div>
  );
}

export default Chat;
