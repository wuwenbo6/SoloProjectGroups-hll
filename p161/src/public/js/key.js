const API_BASE = '/api/v1';

const keyDetail = document.getElementById('keyDetail');
let currentKey = null;

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('zh-CN');
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Copy failed:', err);
    return false;
  }
};

const formatUid = (uid) => {
  if (!uid) return '';
  let text = uid.name || '';
  if (uid.email) text += text ? ` &lt;${uid.email}&gt;` : uid.email;
  if (uid.comment) text += text ? ` (${uid.comment})` : uid.comment;
  return text;
};

const renderTrustGraph = (signatures, signed, keyId) => {
  const nodes = new Map();
  const edges = [];

  nodes.set(keyId, {
    id: keyId,
    label: '当前密钥',
    isCenter: true,
    color: '#667eea'
  });

  signatures.forEach((sig, index) => {
    const signerId = sig.signerKeyId;
    if (!nodes.has(signerId)) {
      const sigText = sig.signerUserIds && sig.signerUserIds.length > 0 
        ? formatUid(sig.signerUserIds[0]) 
        : `0x${signerId}`;
      nodes.set(signerId, {
        id: signerId,
        label: sigText,
        isCenter: false,
        inDb: sig.inDb,
        color: sig.inDb ? '#27ae60' : '#95a5a6'
      });
    }
    edges.push({
      from: signerId,
      to: keyId,
      label: '签名',
      arrows: 'to'
    });
  });

  signed.forEach((sig, index) => {
    const signedId = sig.keyId;
    if (!nodes.has(signedId)) {
      const sigText = sig.userIds && sig.userIds.length > 0 
        ? formatUid(sig.userIds[0]) 
        : `0x${signedId}`;
      nodes.set(signedId, {
        id: signedId,
        label: sigText,
        isCenter: false,
        inDb: true,
        color: '#f39c12'
      });
    }
    edges.push({
      from: keyId,
      to: signedId,
      label: '签名',
      arrows: 'to'
    });
  });

  const width = 600;
  const height = 400;
  const nodeRadius = 40;

  const nodePositions = new Map();
  const nodeArray = Array.from(nodes.values());
  const centerNode = nodeArray.find(n => n.isCenter);
  
  if (centerNode) {
    nodePositions.set(centerNode.id, { x: width / 2, y: height / 2 });

    const otherNodes = nodeArray.filter(n => !n.isCenter);
    const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);
    const radius = 150;

    otherNodes.forEach((node, index) => {
      const angle = index * angleStep - Math.PI / 2;
      nodePositions.set(node.id, {
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle)
      });
    });
  }

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto;">`;

  edges.forEach(edge => {
    const from = nodePositions.get(edge.from);
    const to = nodePositions.get(edge.to);
    if (from && to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const startX = from.x + (dx / dist) * nodeRadius;
      const startY = from.y + (dy / dist) * nodeRadius;
      const endX = to.x - (dx / dist) * (nodeRadius + 10);
      const endY = to.y - (dy / dist) * (nodeRadius + 10);

      const arrowSize = 8;
      const arrowAngle = Math.atan2(dy, dx);

      svg += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#999" stroke-width="2" marker-end="url(#arrowhead)"/>`;
    }
  });

  nodes.forEach(node => {
    const pos = nodePositions.get(node.id);
    if (pos) {
      svg += `<defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#999"/>
        </marker>
      </defs>`;
      
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius}" fill="${node.color}" opacity="0.9"/>`;
      
      const displayText = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
      svg += `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="11" font-weight="500">${displayText}</text>`;
      
      if (node.isCenter) {
        svg += `<text x="${pos.x}" y="${pos.y + nodeRadius + 18}" text-anchor="middle" fill="#667eea" font-size="11" font-weight="600">当前密钥</text>`;
      }
    }
  });

  svg += `</svg>`;

  let legend = '<div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px; justify-content: center;">';
  legend += '<div style="display: flex; align-items: center; gap: 5px;"><span style="width: 16px; height: 16px; background: #667eea; border-radius: 50%;"></span> 当前密钥</div>';
  legend += '<div style="display: flex; align-items: center; gap: 5px;"><span style="width: 16px; height: 16px; background: #27ae60; border-radius: 50%;"></span> 已收录的签名者</div>';
  legend += '<div style="display: flex; align-items: center; gap: 5px;"><span style="width: 16px; height: 16px; background: #95a5a6; border-radius: 50%;"></span> 未收录的签名者</div>';
  legend += '<div style="display: flex; align-items: center; gap: 5px;"><span style="width: 16px; height: 16px; background: #f39c12; border-radius: 50%;"></span> 被该密钥签名</div>';
  legend += '</div>';

  return svg + legend;
};

const renderKeyDetail = (key) => {
  currentKey = key;
  const usersHtml = key.userIds
    .filter(u => u && (u.name || u.email))
    .map(u => `<li>${formatUid(u)}</li>`)
    .join('');

  const algoText = key.keySize ? `${key.algorithm} ${key.keySize}bit` : key.algorithm;

  const emails = key.userIds
    .filter(u => u && u.email)
    .map(u => u.email);

  keyDetail.innerHTML = `
    <div class="detail-section">
      <h2>基本信息</h2>
      <div class="detail-row">
        <span class="detail-label">指纹:</span>
        <span class="detail-value">${key.fingerprintFormatted}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Key ID:</span>
        <span class="detail-value">0x${key.keyId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">算法:</span>
        <span class="detail-value">${algoText}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">创建时间:</span>
        <span class="detail-value">${formatDate(key.createdAt)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">过期时间:</span>
        <span class="detail-value">${key.expiresAt ? formatDate(key.expiresAt) : '永不过期'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">状态:</span>
        <span class="detail-value">${key.revoked ? '<span style="color: #e74c3c;">已吊销</span>' : '<span style="color: #27ae60;">有效</span>'}</span>
      </div>
    </div>

    <div class="detail-section">
      <h2>用户身份</h2>
      <ul>${usersHtml || '<li>无</li>'}</ul>
    </div>

    <div class="detail-section" id="wkdSection" style="display: none;">
      <h2>WKD 发布</h2>
      <div id="wkdContent"></div>
    </div>

    <div class="detail-section" id="signaturesSection" style="display: none;">
      <h2>Web of Trust</h2>
      <div id="signaturesContent"></div>
    </div>

    <div class="detail-section">
      <h2>公钥内容</h2>
      <div style="margin-bottom: 10px;">
        <button class="copy-btn" onclick="copyPublicKey()">复制公钥</button>
        <a class="copy-btn" href="/pks/lookup?op=get&search=0x${key.keyId}" style="text-decoration: none; margin-left: 10px;">下载公钥</a>
      </div>
      <div class="key-block" id="publicKeyBlock">${key.publicKey.replace(/\n/g, '<br>')}</div>
    </div>
  `;

  window.copyPublicKey = async () => {
    const success = await copyToClipboard(key.publicKey);
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = success ? '已复制!' : '复制失败';
    setTimeout(() => btn.textContent = originalText, 2000);
  };

  if (emails.length > 0) {
    loadWkdInfo(emails);
  }

  loadSignatures(key.fingerprint);
};

const loadWkdInfo = async (emails) => {
  try {
    const wkdSection = document.getElementById('wkdSection');
    const wkdContent = document.getElementById('wkdContent');
    
    const wkdPromises = emails.map(email => 
      fetch(`${API_BASE}/wkd/lookup?email=${encodeURIComponent(email)}`)
        .then(res => res.json())
        .then(data => ({ email, data }))
    );
    
    const results = await Promise.all(wkdPromises);
    
    let wkdHtml = '';
    results.forEach(({ email, data }) => {
      if (data.success && data.wkd) {
        wkdHtml += `
          <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <div style="font-weight: 600; margin-bottom: 8px;">${email}</div>
            <div style="font-family: monospace; font-size: 0.85rem; color: #666; word-break: break-all;">
              WKD Hash: ${data.wkd.hash}<br>
              Advanced URL: <a href="${data.wkd.advancedPath}" target="_blank">${data.wkd.advancedPath}</a><br>
              Direct URL: <a href="${data.wkd.directPath}" target="_blank">${data.wkd.directPath}</a>
            </div>
          </div>
        `;
      }
    });
    
    if (wkdHtml) {
      wkdContent.innerHTML = wkdHtml;
      wkdSection.style.display = 'block';
    }
  } catch (error) {
    console.error('Failed to load WKD info:', error);
  }
};

const loadSignatures = async (fingerprint) => {
  try {
    const response = await fetch(`${API_BASE}/keys/${fingerprint}/signatures`);
    const data = await response.json();

    if (data.success) {
      const signaturesSection = document.getElementById('signaturesSection');
      const signaturesContent = document.getElementById('signaturesContent');

      const signatures = data.signatures || [];
      const signed = data.signed || [];

      if (signatures.length > 0 || signed.length > 0) {
        signaturesSection.style.display = 'block';

        let html = '';

        if (signatures.length > 0) {
          html += `
            <h3 style="margin-bottom: 15px; color: #333;">收到的签名 (${signatures.length})</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
          `;
          signatures.forEach(sig => {
            const uidText = sig.signerUserIds && sig.signerUserIds.length > 0
              ? formatUid(sig.signerUserIds[0])
              : `0x${sig.signerKeyId}`;
            const badgeColor = sig.inDb ? 'background: #d4edda; color: #155724;' : 'background: #e2e8f0; color: #4a5568;';
            const linkStart = sig.inDb ? `<a href="/key/${sig.signerFingerprint}" style="text-decoration: none; color: inherit;">` : '';
            const linkEnd = sig.inDb ? '</a>' : '';
            html += `
              ${linkStart}
              <span class="user-badge" style="${badgeColor} cursor: ${sig.inDb ? 'pointer' : 'default'};">
                ${uidText}
              </span>
              ${linkEnd}
            `;
          });
          html += '</div>';
        }

        if (signed.length > 0) {
          html += `
            <h3 style="margin-bottom: 15px; color: #333;">签发的签名 (${signed.length})</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
          `;
          signed.forEach(sig => {
            const uidText = sig.userIds && sig.userIds.length > 0
              ? formatUid(sig.userIds[0])
              : `0x${sig.keyId}`;
            html += `
              <a href="/key/${sig.fingerprint}" style="text-decoration: none;">
                <span class="user-badge" style="background: #fff3cd; color: #856404; cursor: pointer;">
                  ${uidText}
                </span>
              </a>
            `;
          });
          html += '</div>';
        }

        if (signatures.length > 0 || signed.length > 0) {
          html += `
            <h3 style="margin-bottom: 15px; color: #333;">信任关系图</h3>
            <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
              ${renderTrustGraph(signatures, signed, data.key.keyId)}
            </div>
          `;
        }

        signaturesContent.innerHTML = html;
      }
    }
  } catch (error) {
    console.error('Failed to load signatures:', error);
  }
};

const loadKeyDetail = async () => {
  const fingerprint = window.location.pathname.split('/').pop();
  
  if (!fingerprint) {
    keyDetail.innerHTML = '<div class="alert alert-error">无效的密钥指纹</div>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/keys/${fingerprint}`);
    const data = await response.json();

    if (data.success) {
      renderKeyDetail(data.key);
    } else {
      keyDetail.innerHTML = `<div class="alert alert-error">${data.error || '密钥不存在'}</div>`;
    }
  } catch (error) {
    console.error('Failed to load key:', error);
    keyDetail.innerHTML = '<div class="alert alert-error">加载失败，请稍后重试</div>';
  }
};

loadKeyDetail();
