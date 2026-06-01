class RemotePCAP {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.packets = [];
    this.selectedPacket = null;
    this.isPaused = false;
    this.pauseBuffer = [];
    this.tcpStreams = [];
    this.selectedStream = null;
    this.expertInfo = [];
    this.expertCount = 0;

    this.initElements();
    this.bindEvents();
    this.loadInterfaces();
  }

  initElements() {
    this.sessionPanel = document.getElementById('sessionPanel');
    this.capturePanel = document.getElementById('capturePanel');

    this.interfaceSelect = document.getElementById('interfaceSelect');
    this.filterInput = document.getElementById('filterInput');
    this.filterHint = document.getElementById('filterHint');
    this.filterError = document.getElementById('filterError');
    this.startBtn = document.getElementById('startBtn');
    this.sessionIdInput = document.getElementById('sessionIdInput');
    this.joinBtn = document.getElementById('joinBtn');

    this.connectionStatus = document.getElementById('connectionStatus');
    this.connectionText = document.getElementById('connectionText');

    this.sessionIdEl = document.getElementById('sessionId');
    this.captureInterfaceEl = document.getElementById('captureInterface');
    this.captureFilterEl = document.getElementById('captureFilter');
    this.packetCountEl = document.getElementById('packetCount');
    this.clientCountEl = document.getElementById('clientCount');

    this.pauseBtn = document.getElementById('pauseBtn');
    this.exportBtn = document.getElementById('exportBtn');
    this.clearBtn = document.getElementById('clearBtn');
    this.shareBtn = document.getElementById('shareBtn');

    this.packetListEl = document.getElementById('packetList');
    this.packetDetailEl = document.getElementById('packetDetail');

    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabPanels = document.querySelectorAll('.tab-panel');
    this.streamListEl = document.getElementById('streamList');
    this.streamDetailEl = document.getElementById('streamDetail');
    this.expertListEl = document.getElementById('expertList');
    this.expertBadge = document.getElementById('expertBadge');
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startSession());
    this.joinBtn.addEventListener('click', () => this.joinSession());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.exportBtn.addEventListener('click', () => this.exportPCAPNG());
    this.clearBtn.addEventListener('click', () => this.stopSession());
    this.shareBtn.addEventListener('click', () => this.copySessionId());
    this.filterInput.addEventListener('input', () => this.debouncedValidateFilter());

    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  }

  async loadInterfaces() {
    try {
      const response = await fetch('/api/interfaces');
      const interfaces = await response.json();

      this.interfaceSelect.innerHTML = '';
      interfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface.name;
        option.textContent = `${iface.name} - ${iface.description || 'No description'}`;
        this.interfaceSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load interfaces:', err);
      this.interfaceSelect.innerHTML = '<option value="">Failed to load interfaces</option>';
    }
  }

  async startSession() {
    const iface = this.interfaceSelect.value;
    const filter = this.filterInput.value.trim();

    if (!iface) {
      alert('请选择网络接口');
      return;
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: iface, filter })
      });

      const data = await response.json();

      if (response.ok) {
        this.sessionId = data.sessionId;
        this.showCapturePanel(data);
        this.connectWebSocket();
      } else {
        let errorMsg = data.error;
        if (data.hint && data.hint.length > 0) {
          errorMsg += '\n\n提示:\n' + data.hint.join('\n');
        }
        alert(`创建会话失败:\n${errorMsg}`);
      }
    } catch (err) {
      alert(`创建会话失败: ${err.message}`);
    }
  }

  async joinSession() {
    const sessionId = this.sessionIdInput.value.trim();

    if (!sessionId) {
      alert('请输入会话 ID');
      return;
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      const data = await response.json();

      if (response.ok) {
        this.sessionId = data.sessionId;
        this.showCapturePanel(data);
        this.connectWebSocket();
      } else {
        alert(`加入会话失败: ${data.error}`);
      }
    } catch (err) {
      alert(`加入会话失败: ${err.message}`);
    }
  }

  showCapturePanel(data) {
    this.sessionPanel.classList.add('hidden');
    this.capturePanel.classList.remove('hidden');

    this.sessionIdEl.textContent = data.sessionId;
    this.captureInterfaceEl.textContent = data.interface;
    this.captureFilterEl.textContent = data.filter || '(无)';
    this.packetCountEl.textContent = '0';
    this.clientCountEl.textContent = data.clients || '1';
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.updateConnectionStatus(true);

      this.ws.send(JSON.stringify({
        type: 'join',
        sessionId: this.sessionId
      }));

      this.ws.send(JSON.stringify({
        type: 'request_history',
        limit: 50
      }));

      this.ws.send(JSON.stringify({
        type: 'request_streams'
      }));

      this.ws.send(JSON.stringify({
        type: 'request_expert',
        limit: 100
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      this.updateConnectionStatus(false);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      this.updateConnectionStatus(false);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'connected':
        break;

      case 'joined':
        this.clientCountEl.textContent = data.clients;
        if (data.startedAt) {
          const startTime = new Date(data.startedAt).toLocaleTimeString();
        }
        break;

      case 'client_joined':
      case 'client_left':
        this.clientCountEl.textContent = data.clients;
        break;

      case 'packet':
        if (this.isPaused) {
          this.pauseBuffer.push(data.data);
        } else {
          this.addPacket(data.data);
        }
        break;

      case 'packet_batch':
        if (this.isPaused) {
          this.pauseBuffer.push(...data.packets);
        } else {
          this.addPacketsBatch(data.packets);
        }
        break;

      case 'new_stream':
      case 'stream_updated':
        this.updateStream(data.stream);
        break;

      case 'streams':
        data.streams.forEach(stream => this.updateStream(stream));
        break;

      case 'expert_info':
        this.addExpertInfo(data.data);
        break;

      case 'expert':
        data.expertInfo.forEach(info => this.addExpertInfo(info));
        break;

      case 'congestion_warning':
        console.warn(`Congestion: dropped ${data.droppedPackets} packets`);
        break;

      case 'backpressure':
        console.warn('Backpressure: client too slow');
        break;

      case 'history':
        data.packets.forEach(packet => this.addPacket(packet));
        break;

      case 'error':
        console.error('Server error:', data.message);
        break;
    }
  }

  addPacket(packet) {
    this.packets.push(packet);
    this.packetCountEl.textContent = this.packets.length;

    const item = this.createPacketItem(packet);
    this.packetListEl.appendChild(item);

    while (this.packetListEl.children.length > 500) {
      this.packetListEl.removeChild(this.packetListEl.firstChild);
    }

    this.packetListEl.scrollTop = this.packetListEl.scrollHeight;
  }

  addPacketsBatch(packets) {
    this.packets.push(...packets);
    this.packetCountEl.textContent = this.packets.length;

    const fragment = document.createDocumentFragment();
    packets.forEach(packet => {
      const item = this.createPacketItem(packet);
      fragment.appendChild(item);
    });
    this.packetListEl.appendChild(fragment);

    while (this.packetListEl.children.length > 500) {
      this.packetListEl.removeChild(this.packetListEl.firstChild);
    }

    this.packetListEl.scrollTop = this.packetListEl.scrollHeight;
  }

  debouncedValidateFilter = this.debounce(() => this.validateFilter(), 300);

  async validateFilter() {
    const filter = this.filterInput.value.trim();
    if (!filter) {
      this.filterInput.classList.remove('filter-valid', 'filter-invalid');
      this.filterError.classList.add('hidden');
      this.filterHint.classList.remove('hidden');
      return;
    }

    this.filterHint.classList.add('hidden');

    try {
      const response = await fetch('/api/validate-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter })
      });

      const result = await response.json();
      if (result.valid) {
        this.filterInput.classList.remove('filter-invalid');
        this.filterInput.classList.add('filter-valid');
        this.filterError.classList.add('hidden');
      } else {
        this.filterInput.classList.remove('filter-valid');
        this.filterInput.classList.add('filter-invalid');
        this.filterError.textContent = result.message;
        if (result.hint && result.hint.length > 0) {
          this.filterError.textContent += ' (' + result.hint.join('; ') + ')';
        }
        this.filterError.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Filter validation error:', err);
    }
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  switchTab(tabName) {
    this.tabBtns.forEach(btn => btn.classList.remove('active'));
    this.tabPanels.forEach(panel => panel.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
  }

  updateStream(stream) {
    const existingIndex = this.tcpStreams.findIndex(s => s.index === stream.index);
    if (existingIndex >= 0) {
      this.tcpStreams[existingIndex] = stream;
    } else {
      this.tcpStreams.push(stream);
    }

    this.renderStreamList();
  }

  renderStreamList() {
    const placeholder = this.streamListEl.querySelector('.detail-placeholder');
    if (placeholder) {
      this.streamListEl.innerHTML = '';
    }

    this.tcpStreams.forEach(stream => {
      let existingItem = this.streamListEl.querySelector(`[data-stream-index="${stream.index}"]`);
      if (existingItem) {
        existingItem.remove();
      }

      const item = document.createElement('div');
      item.className = 'stream-item';
      item.dataset.streamIndex = stream.index;

      const totalPackets = (stream.packetCount?.[stream.src] || 0) + (stream.packetCount?.[stream.dst] || 0);
      const totalBytes = (stream.byteCount?.[stream.src] || 0) + (stream.byteCount?.[stream.dst] || 0);
      const statusClass = `status-${stream.status}`;

      item.innerHTML = `
        <div class="col-no">${stream.index}</div>
        <div class="col-src">${stream.src} → ${stream.dst}</div>
        <div class="col-packets">${totalPackets}</div>
        <div class="col-bytes">${this.formatBytes(totalBytes)}</div>
        <div class="col-status ${statusClass}">${stream.status}</div>
      `;

      item.addEventListener('click', () => this.selectStream(stream, item));

      if (this.selectedStream && this.selectedStream.index === stream.index) {
        item.classList.add('selected');
      }

      this.streamListEl.appendChild(item);
    });

    this.streamListEl.scrollTop = this.streamListEl.scrollHeight;
  }

  async selectStream(stream, element) {
    document.querySelectorAll('.stream-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    this.selectedStream = stream;

    try {
      const response = await fetch(`/api/sessions/${this.sessionId}/streams/${stream.index}/packets`);
      const data = await response.json();
      this.showStreamDetail(data.stream, data.packets);
    } catch (err) {
      console.error('Failed to load stream packets:', err);
    }
  }

  showStreamDetail(stream, packets) {
    const html = [];

    html.push('<div class="detail-section">');
    html.push('<h3>TCP 流信息</h3>');
    html.push(`<div class="detail-row"><span class="key">源</span><span class="val">${stream.src}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">目的</span><span class="val">${stream.dst}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">状态</span><span class="val">${stream.status}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">开始时间</span><span class="val">${new Date(stream.startTime).toLocaleString()}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">结束时间</span><span class="val">${new Date(stream.endTime).toLocaleString()}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">包数 (A→B)</span><span class="val">${stream.packetCount?.[stream.src] || 0}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">包数 (B→A)</span><span class="val">${stream.packetCount?.[stream.dst] || 0}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">字节 (A→B)</span><span class="val">${this.formatBytes(stream.byteCount?.[stream.src] || 0)}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">字节 (B→A)</span><span class="val">${this.formatBytes(stream.byteCount?.[stream.dst] || 0)}</span></div>`);
    html.push('</div>');

    html.push('<div class="detail-section">');
    html.push('<h3>数据包流向</h3>');
    html.push('<div class="packet-flow">');

    packets.forEach(packet => {
      const isOut = packet.payload?.ip?.src === stream.src.split(':')[0];
      const direction = isOut ? '→' : '←';
      const flags = packet.payload?.tcp?.flags;
      const flagStr = [];
      if (flags?.syn) flagStr.push('SYN');
      if (flags?.ack) flagStr.push('ACK');
      if (flags?.fin) flagStr.push('FIN');
      if (flags?.rst) flagStr.push('RST');
      if (flags?.psh) flagStr.push('PSH');

      const flowClass = isOut ? 'out' : 'in';
      html.push(`<div class="flow-item ${flowClass}">
        ${direction} #${packet.index} ${flagStr.join(' ')} (${packet.length} bytes)
      </div>`);
    });

    html.push('</div>');
    html.push('</div>');

    this.streamDetailEl.innerHTML = html.join('');
  }

  addExpertInfo(info) {
    this.expertInfo.push(info);
    this.expertCount++;

    if (this.expertBadge) {
      this.expertBadge.textContent = this.expertCount;
      this.expertBadge.classList.remove('hidden');
    }

    this.renderExpertInfo(info);
  }

  renderExpertInfo(info) {
    const placeholder = this.expertListEl.querySelector('.detail-placeholder');
    if (placeholder) {
      this.expertListEl.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'expert-item';

    const time = new Date(info.timestamp).toLocaleTimeString();
    const badgeClass = `severity-badge ${info.severity}`;

    item.innerHTML = `
      <div class="col-severity"><span class="${badgeClass}">${info.severity.toUpperCase()}</span></div>
      <div class="col-time">${time}</div>
      <div class="col-type">${info.type}</div>
      <div class="col-msg">${info.message}</div>
    `;

    item.addEventListener('click', () => {
      const packet = this.packets.find(p => p.index === info.packetIndex);
      if (packet) {
        this.switchTab('packets');
        const packetItem = document.querySelector(`.packet-item[data-index="${info.packetIndex}"]`);
        if (packetItem) {
          this.selectPacket(packet, packetItem);
          packetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });

    this.expertListEl.appendChild(item);
    this.expertListEl.scrollTop = this.expertListEl.scrollHeight;

    while (this.expertListEl.children.length > 200) {
      this.expertListEl.removeChild(this.expertListEl.firstChild);
    }
  }

  exportPCAPNG() {
    window.open(`/api/sessions/${this.sessionId}/export`, '_blank');
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  createPacketItem(packet) {
    const item = document.createElement('div');
    item.className = 'packet-item';
    item.dataset.index = packet.index;

    const time = new Date(packet.timestamp).toLocaleTimeString();
    let src = packet.payload?.ip?.src || '-';
    let dst = packet.payload?.ip?.dst || '-';
    let proto = packet.payload?.transport || 'OTHER';

    if (packet.srcPort) src += `:${packet.srcPort}`;
    if (packet.dstPort) dst += `:${packet.dstPort}`;

    const protoClass = `proto-${proto.toLowerCase()}`;

    item.innerHTML = `
      <div class="col-no">${packet.index}</div>
      <div class="col-time">${time}</div>
      <div class="col-src">${src}</div>
      <div class="col-dst">${dst}</div>
      <div class="col-proto ${protoClass}">${proto}</div>
      <div class="col-len">${packet.length}</div>
    `;

    item.addEventListener('click', () => this.selectPacket(packet, item));

    return item;
  }

  selectPacket(packet, element) {
    document.querySelectorAll('.packet-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    this.selectedPacket = packet;
    this.showPacketDetail(packet);
  }

  showPacketDetail(packet) {
    const html = [];

    html.push('<div class="detail-section">');
    html.push('<h3>基本信息</h3>');
    html.push(`<div class="detail-row"><span class="key">序号</span><span class="val">#${packet.index}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">时间</span><span class="val">${new Date(packet.timestamp).toLocaleString()}</span></div>`);
    html.push(`<div class="detail-row"><span class="key">长度</span><span class="val">${packet.length} 字节</span></div>`);
    html.push(`<div class="detail-row"><span class="key">链路类型</span><span class="val">${packet.linkType}</span></div>`);
    html.push('</div>');

    if (packet.payload?.ethernet) {
      html.push('<div class="detail-section">');
      html.push('<h3>以太网层</h3>');
      html.push(`<div class="detail-row"><span class="key">源 MAC</span><span class="val">${packet.payload.ethernet.src || '-'}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">目的 MAC</span><span class="val">${packet.payload.ethernet.dst || '-'}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">类型</span><span class="val">${packet.payload.ethernet.type || '-'}</span></div>`);
      html.push('</div>');
    }

    if (packet.payload?.ip) {
      html.push('<div class="detail-section">');
      html.push('<h3>IP 层</h3>');
      html.push(`<div class="detail-row"><span class="key">版本</span><span class="val">IPv${packet.payload.ip.version}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">源地址</span><span class="val">${packet.payload.ip.src}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">目的地址</span><span class="val">${packet.payload.ip.dst}</span></div>`);
      if (packet.payload.ip.protocol) {
        html.push(`<div class="detail-row"><span class="key">协议</span><span class="val">${packet.payload.ip.protocol}</span></div>`);
      }
      if (packet.payload.ip.ttl) {
        html.push(`<div class="detail-row"><span class="key">TTL</span><span class="val">${packet.payload.ip.ttl}</span></div>`);
      }
      html.push('</div>');
    }

    if (packet.payload?.tcp) {
      html.push('<div class="detail-section">');
      html.push('<h3>TCP 层</h3>');
      html.push(`<div class="detail-row"><span class="key">源端口</span><span class="val">${packet.payload.tcp.srcPort}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">目的端口</span><span class="val">${packet.payload.tcp.dstPort}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">序列号</span><span class="val">${packet.payload.tcp.seqNo}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">确认号</span><span class="val">${packet.payload.tcp.ackNo}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">窗口大小</span><span class="val">${packet.payload.tcp.windowSize}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">Flags</span><span class="val">${this.formatTCPFlags(packet.payload.tcp.flags)}</span></div>`);
      html.push('</div>');
    }

    if (packet.payload?.udp) {
      html.push('<div class="detail-section">');
      html.push('<h3>UDP 层</h3>');
      html.push(`<div class="detail-row"><span class="key">源端口</span><span class="val">${packet.payload.udp.srcPort}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">目的端口</span><span class="val">${packet.payload.udp.dstPort}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">长度</span><span class="val">${packet.payload.udp.length}</span></div>`);
      html.push(`<div class="detail-row"><span class="key">校验和</span><span class="val">${packet.payload.udp.checksum}</span></div>`);
      html.push('</div>');
    }

    html.push('<div class="detail-section">');
    html.push('<h3>原始数据 (Hex)</h3>');
    html.push(`<div class="hex-container">${this.formatHexDump(packet.rawHex)}</div>`);
    html.push('</div>');

    this.packetDetailEl.innerHTML = html.join('');
  }

  formatTCPFlags(flags) {
    const parts = [];
    if (flags.syn) parts.push('SYN');
    if (flags.ack) parts.push('ACK');
    if (flags.fin) parts.push('FIN');
    if (flags.rst) parts.push('RST');
    if (flags.psh) parts.push('PSH');
    if (flags.urg) parts.push('URG');
    return parts.join(', ') || '(none)';
  }

  formatHexDump(hexString) {
    const lines = [];
    const bytesPerLine = 16;

    for (let i = 0; i < hexString.length; i += bytesPerLine * 2) {
      const offset = (i / 2).toString(16).padStart(4, '0');
      const hexPart = hexString.slice(i, i + bytesPerLine * 2);
      const bytes = hexPart.match(/.{2}/g) || [];

      while (bytes.length < bytesPerLine) {
        bytes.push('  ');
      }

      const hexFormatted = bytes.join(' ');
      const asciiPart = bytes.map(b => {
        if (b === '  ') return ' ';
        const code = parseInt(b, 16);
        return (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
      }).join('');

      lines.push(`<div class="hex-line"><span class="hex-offset">${offset}</span><span class="hex-bytes">${hexFormatted}</span><span class="hex-ascii">${asciiPart}</span></div>`);
    }

    return lines.join('');
  }

  togglePause() {
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.pauseBtn.textContent = '继续';
    } else {
      this.pauseBtn.textContent = '暂停';
      this.pauseBuffer.forEach(packet => this.addPacket(packet));
      this.pauseBuffer = [];
    }
  }

  async stopSession() {
    try {
      await fetch(`/api/sessions/${this.sessionId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to stop session:', err);
    }

    if (this.ws) {
      this.ws.close();
    }

    this.sessionId = null;
    this.packets = [];
    this.selectedPacket = null;
    this.tcpStreams = [];
    this.selectedStream = null;
    this.expertInfo = [];
    this.expertCount = 0;

    this.packetListEl.innerHTML = '';
    this.packetDetailEl.innerHTML = '<div class="detail-placeholder">选择一个数据包查看详情</div>';
    this.streamListEl.innerHTML = '<div class="detail-placeholder">暂无 TCP 流数据</div>';
    this.streamDetailEl.innerHTML = '<div class="detail-placeholder">选择一个 TCP 流查看详情</div>';
    this.expertListEl.innerHTML = '<div class="detail-placeholder">暂无专家信息</div>';

    this.packetCountEl.textContent = '0';
    this.clientCountEl.textContent = '0';

    if (this.expertBadge) {
      this.expertBadge.classList.add('hidden');
      this.expertBadge.textContent = '0';
    }

    this.switchTab('packets');

    this.capturePanel.classList.add('hidden');
    this.sessionPanel.classList.remove('hidden');
  }

  copySessionId() {
    navigator.clipboard.writeText(this.sessionId).then(() => {
      this.shareBtn.textContent = '已复制!';
      setTimeout(() => {
        this.shareBtn.textContent = '复制会话ID';
      }, 2000);
    }).catch(err => {
      alert(`复制失败: ${err.message}`);
    });
  }

  updateConnectionStatus(connected) {
    if (connected) {
      this.connectionStatus.className = 'status connected';
      this.connectionText.textContent = '已连接';
    } else {
      this.connectionStatus.className = 'status disconnected';
      this.connectionText.textContent = '未连接';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RemotePCAP();
});
