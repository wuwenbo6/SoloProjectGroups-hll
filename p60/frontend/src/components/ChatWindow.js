import { useState, useCallback } from 'react';
import Message from './Message';
import FileUpload from './FileUpload';
import ExportModal from './ExportModal';

function ChatWindow({ user, activeChat, messages, decryptedMessages, readReceipts, typingUsers, onSendMessage, onSendFile, onFileDownload, onTyping, messagesEndRef, fileDecryptionKey }) {
  const [inputValue, setInputValue] = useState('');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const typingTimeoutRef = useState(null)[0];

  const handleTyping = useCallback(() => {
    onTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  }, [onTyping, typingTimeoutRef]);

  const handleSend = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
      onTyping(false);
    }
  };

  const handleFileSelect = (file) => {
    onSendFile(file);
    setShowFileUpload(false);
  };

  const typingUserNames = Object.values(typingUsers).filter(Boolean);

  if (!activeChat) {
    return (
      <div className="chat-window empty">
        <div className="empty-chat">
          <div className="empty-icon">💬</div>
          <h2>选择一个对话开始聊天</h2>
          <p>您的消息将使用 NTRU 后量子加密保护</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-title">
          <div className="avatar">{activeChat.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="chat-name">{activeChat.name}</div>
            <div className="chat-subtitle">
              {activeChat.type === 'group' ? '群组聊天' : '私聊'}
              <span className="encryption-badge">🔐 端到端加密</span>
              <span className="forward-secrecy-badge">🔄 前向保密</span>
            </div>
          </div>
        </div>
        <div className="chat-actions">
          <button 
            className="action-btn" 
            onClick={() => setShowExportModal(true)}
            title="导出聊天记录"
          >
            📥
          </button>
        </div>
      </div>

      <div className="messages-container">
        {messages.map(message => (
          <Message
            key={message.id}
            message={message}
            decryptedContent={decryptedMessages[message.id]}
            isOwn={message.sender_id === user.userId}
            readReceipts={readReceipts[message.id] || []}
            onFileDownload={onFileDownload}
            fileDecryptionKey={fileDecryptionKey}
          />
        ))}
        {typingUserNames.length > 0 && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>{typingUserNames.join(', ')} 正在输入...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showFileUpload && (
        <div className="file-upload-modal">
          <div className="file-upload-header">
            <span>发送文件</span>
            <button onClick={() => setShowFileUpload(false)} className="close-btn">×</button>
          </div>
          <FileUpload onFileSelect={handleFileSelect} maxSize={10 * 1024 * 1024} />
        </div>
      )}

      <div className="message-input-container">
        <form onSubmit={handleSend} className="message-form">
          <button 
            type="button" 
            className="attach-btn"
            onClick={() => setShowFileUpload(!showFileUpload)}
            title="附件"
          >
            📎
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              handleTyping();
            }}
            placeholder="输入消息..."
            className="message-input"
          />
          <button type="submit" className="send-btn">
            发送
          </button>
        </form>
      </div>

      {showExportModal && (
        <ExportModal
          messages={messages}
          decryptedMessages={decryptedMessages}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export default ChatWindow;
