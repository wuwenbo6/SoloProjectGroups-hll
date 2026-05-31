import { useState } from 'react';
import { exportChatHistory, downloadFile, generateSymmetricKey } from '../utils/crypto';

function ExportModal({ messages, decryptedMessages, onClose }) {
  const [format, setFormat] = useState('json');
  const [encrypt, setEncrypt] = useState(false);
  const [exportKey, setExportKey] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleGenerateKey = () => {
    setGeneratingKey(true);
    const key = generateSymmetricKey();
    setExportKey(key);
    setGeneratingKey(false);
  };

  const handleExport = async () => {
    if (encrypt && !exportKey) {
      alert('请输入或生成加密密钥');
      return;
    }

    setExporting(true);
    try {
      const result = await exportChatHistory(
        messages,
        decryptedMessages,
        encrypt ? exportKey : null,
        format
      );

      const mimeType = format === 'json' 
        ? (encrypt ? 'application/octet-stream' : 'application/json')
        : 'text/plain';
      
      downloadFile(result.data, result.filename, mimeType);
      
      if (encrypt) {
        alert(`导出成功！\n\n请妥善保存您的加密密钥：\n${exportKey}\n\n没有密钥将无法解密此文件。`);
      } else {
        alert('导出成功！');
      }
      
      onClose();
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportKey);
    alert('密钥已复制到剪贴板');
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>导出聊天记录</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-content">
          <div className="form-group">
            <label>导出格式</label>
            <div className="format-options">
              <label className="format-option">
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={format === 'json'}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <span>JSON 格式</span>
              </label>
              <label className="format-option">
                <input
                  type="radio"
                  name="format"
                  value="text"
                  checked={format === 'text'}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <span>纯文本格式</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
              />
              <span>加密导出文件（AES-256）</span>
            </label>
          </div>

          {encrypt && (
            <div className="form-group">
              <label>加密密钥</label>
              <div className="key-input-group">
                <input
                  type="text"
                  value={exportKey}
                  onChange={(e) => setExportKey(e.target.value)}
                  placeholder="输入密钥或点击生成"
                  className="key-input"
                />
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={generatingKey}
                  className="generate-key-btn"
                >
                  {generatingKey ? '生成中...' : '生成密钥'}
                </button>
              </div>
              {exportKey && (
                <div className="key-display">
                  <code>{exportKey}</code>
                  <button onClick={copyToClipboard} className="copy-btn">
                    复制
                  </button>
                </div>
              )}
              <small className="key-warning">
                ⚠️ 请务必保存好密钥，丢失将无法解密文件
              </small>
            </div>
          )}

          <div className="export-info">
            <p>将导出 <strong>{messages.length}</strong> 条消息</p>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button 
            onClick={handleExport} 
            className="btn-primary"
            disabled={exporting || (encrypt && !exportKey)}
          >
            {exporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
