function Message({ message, decryptedContent, isOwn, readReceipts, onFileDownload, fileDecryptionKey }) {
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return '📄';
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎬';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType.includes('pdf')) return '📕';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
    return '📄';
  };

  const handleDownload = () => {
    if (onFileDownload && message.message_type === 'file') {
      onFileDownload(message, fileDecryptionKey);
    }
  };

  if (message.message_type === 'key_rotate') {
    return (
      <div className="message system">
        <div className="system-message">
          <span className="key-rotate-icon">🔄</span>
          <span>会话密钥已轮换（前向保密）</span>
        </div>
      </div>
    );
  }

  if (message.message_type === 'file') {
    return (
      <div className={`message ${isOwn ? 'own' : 'other'}`}>
        {!isOwn && (
          <div className="message-avatar">
            {message.sender_name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        <div className="message-content-wrapper">
          {!isOwn && (
            <div className="message-sender">{message.sender_name}</div>
          )}
          <div className="message-bubble file-bubble" onClick={handleDownload}>
            <div className="file-content">
              <div className="file-icon">{getFileIcon(message.file_type)}</div>
              <div className="file-info">
                <div className="file-name">{message.file_name || '文件'}</div>
                <div className="file-size">{formatFileSize(message.file_size)}</div>
              </div>
              <div className="download-icon">⬇️</div>
            </div>
            <div className="message-meta">
              <span className="message-time">{formatTime(message.created_at)}</span>
              {isOwn && (
                <span className="read-status">
                  {readReceipts.length > 0 ? (
                    <span className="read">✓✓ 已读 ({readReceipts.length})</span>
                  ) : (
                    <span className="sent">✓ 已发送</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        {isOwn && (
          <div className="message-avatar own-avatar">
            {message.sender_name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`message ${isOwn ? 'own' : 'other'}`}>
      {!isOwn && (
        <div className="message-avatar">
          {message.sender_name?.charAt(0).toUpperCase() || '?'}
        </div>
      )}
      <div className="message-content-wrapper">
        {!isOwn && (
          <div className="message-sender">{message.sender_name}</div>
        )}
        <div className="message-bubble">
          {decryptedContent ? (
            <p className="message-text">{decryptedContent}</p>
          ) : (
            <p className="message-text encrypted">
              <span className="lock-icon">🔒</span>
              消息已加密
            </p>
          )}
          <div className="message-meta">
            <span className="message-time">{formatTime(message.created_at)}</span>
            {isOwn && (
              <span className="read-status">
                {readReceipts.length > 0 ? (
                  <span className="read">
                    ✓✓ 已读 ({readReceipts.length})
                  </span>
                ) : (
                  <span className="sent">✓ 已发送</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
      {isOwn && (
        <div className="message-avatar own-avatar">
          {message.sender_name?.charAt(0).toUpperCase() || '?'}
        </div>
      )}
    </div>
  );
}

export default Message;
