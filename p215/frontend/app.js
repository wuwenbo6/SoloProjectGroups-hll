class MTP2Simulator {
    constructor() {
        this.ws = null;
        this.currentState = 'IDLE';
        this.messages = [];
        this.transitions = [];
        this.protocolEvents = [];
        this.fisuCount = 0;
        this.lssuCount = 0;
        this.msuCount = 0;
        this.selectedMessage = null;
        this.maxMessages = 100;
        this.maxEvents = 150;
        this.syncStatus = 'IN_SYNC';
        this.expectedFSN = 0;

        this.initElements();
        this.initEventListeners();
        this.connect();
    }

    initElements() {
        this.currentStateEl = document.getElementById('current-state');
        this.syncStatusEl = document.getElementById('sync-status');
        this.expectedFSNEl = document.getElementById('expected-fsn');
        this.messageListEl = document.getElementById('message-list');
        this.transitionListEl = document.getElementById('transition-list');
        this.eventListEl = document.getElementById('event-list');
        this.connectionIndicator = document.getElementById('connection-indicator');
        this.connectionText = document.getElementById('connection-text');
        this.fisuCountEl = document.getElementById('fisu-count');
        this.lssuCountEl = document.getElementById('lssu-count');
        this.msuCountEl = document.getElementById('msu-count');
        this.totalCountEl = document.getElementById('total-count');
        this.messageDetailEl = document.getElementById('message-detail');
        this.detailContentEl = document.getElementById('detail-content');
        this.msgTypeSelect = document.getElementById('msg-type');
        this.lssuStatusSelect = document.getElementById('lssu-status');
        this.msuSiSelect = document.getElementById('msu-si');
        this.lostFramesEl = document.getElementById('lost-frames');
        this.frameLossRateEl = document.getElementById('frame-loss-rate');
        this.retransmittedEl = document.getElementById('retransmitted');
        this.retransmitRateEl = document.getElementById('retransmit-rate');
        this.t1RetransmissionsEl = document.getElementById('t1-retransmissions');
        this.t3RetransmissionsEl = document.getElementById('t3-retransmissions');
        this.qualityFillEl = document.getElementById('quality-fill');
        this.qualityPercentEl = document.getElementById('quality-percent');
        this.pcapCountEl = document.getElementById('pcap-count');
        this.btnExportPcap = document.getElementById('btn-export-pcap');
    }

    initEventListeners() {
        document.getElementById('btn-start').addEventListener('click', () => this.sendAction('start'));
        document.getElementById('btn-stop').addEventListener('click', () => this.sendAction('stop'));
        document.getElementById('btn-reset').addEventListener('click', () => this.reset());
        document.getElementById('btn-send-msg').addEventListener('click', () => this.sendManualMessage());

        document.querySelectorAll('.btn-state').forEach(btn => {
            btn.addEventListener('click', () => {
                const state = btn.dataset.state;
                this.sendAction('set_state', { state });
            });
        });

        document.getElementById('duration').addEventListener('change', (e) => {
            this.sendAction('set_duration', { duration: parseFloat(e.target.value) });
        });

        document.getElementById('auto-advance').addEventListener('change', (e) => {
            this.sendAction('set_auto_advance', { auto: e.target.checked });
        });

        document.getElementById('simulate-errors').addEventListener('change', (e) => {
            this.sendAction('set_simulate_errors', { simulate_errors: e.target.checked });
        });

        this.msgTypeSelect.addEventListener('change', () => {
            const type = this.msgTypeSelect.value;
            this.lssuStatusSelect.style.display = type === 'LSSU' ? 'block' : 'none';
            this.msuSiSelect.style.display = type === 'MSU' ? 'block' : 'none';
        });

        this.btnExportPcap.addEventListener('click', () => this.exportPcap());
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.setConnectionStatus(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };

        this.ws.onclose = () => {
            this.setConnectionStatus(false);
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    setConnectionStatus(connected) {
        if (connected) {
            this.connectionIndicator.className = 'indicator connected';
            this.connectionText.textContent = '已连接';
        } else {
            this.connectionIndicator.className = 'indicator disconnected';
            this.connectionText.textContent = '未连接';
        }
    }

    sendAction(action, params = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action, ...params }));
        }
    }

    sendManualMessage() {
        const type = this.msgTypeSelect.value;
        const params = { type };

        if (type === 'LSSU') {
            params.status = this.lssuStatusSelect.value;
        } else if (type === 'MSU') {
            params.si = this.msuSiSelect.value;
        }

        this.sendAction('send_message', params);
    }

    handleMessage(data) {
        switch (data.event) {
            case 'initial_state':
                this.updateState(data.state);
                if (data.sync_status) {
                    this.updateSyncStatus(data.sync_status);
                }
                break;
            case 'state_change':
                this.updateState(data.state);
                if (data.sync_status) {
                    this.updateSyncStatus(data.sync_status);
                }
                if (data.transition) {
                    this.addTransition(data.transition);
                }
                break;
            case 'message':
                this.addMessage(data.message, data.state, data.sync_status);
                break;
            case 'timer_event':
                this.handleTimerEvent(data.timer, data.state);
                break;
            case 'fsn_validation':
                this.handleFSNValidation(data.fsn_result, data.state);
                break;
            case 'sync_recovered':
                this.updateSyncStatus('IN_SYNC');
                this.addProtocolEvent('sync', '同步恢复', '链路重新同步成功');
                break;
            case 'stats':
                this.updateStats(data);
                break;
        }
    }

    updateState(state) {
        this.currentState = state;
        this.currentStateEl.textContent = state;
        this.currentStateEl.className = `state-badge ${state.toLowerCase()}`;

        document.querySelectorAll('.state-node').forEach(node => {
            node.classList.remove('active');
        });

        const activeNode = document.getElementById(`state-${state}`);
        if (activeNode) {
            activeNode.classList.add('active');
        }
    }

    updateSyncStatus(syncStatus) {
        this.syncStatus = syncStatus || 'IN_SYNC';
        if (syncStatus === 'IN_SYNC') {
            this.syncStatusEl.textContent = 'IN_SYNC';
            this.syncStatusEl.className = 'sync-badge in-sync';
        } else {
            this.syncStatusEl.textContent = 'OUT_OF_SYNC';
            this.syncStatusEl.className = 'sync-badge out-of-sync';
        }
    }

    handleTimerEvent(timer, state) {
        if (!timer) return;

        const timerLower = timer.timer.toLowerCase();
        const panelId = `${timerLower}-panel`;
        const panel = document.getElementById(panelId);

        const statusEl = document.getElementById(`${timerLower}-status`);
        const retriesEl = document.getElementById(`${timerLower}-retries`);
        const maxEl = document.getElementById(`${timerLower}-max`);
        const progressEl = document.getElementById(`${timerLower}-progress`);

        if (retriesEl) retriesEl.textContent = timer.retries || 0;
        if (maxEl) maxEl.textContent = timer.max_retries || 0;

        let statusText = '未激活';
        let statusClass = 'inactive';
        let progressWidth = '0%';
        let panelClass = 'timer-panel';

        switch (timer.action) {
            case 'started':
                statusText = '运行中';
                statusClass = 'running';
                progressWidth = '10%';
                panelClass = `timer-panel active-${timerLower}`;
                this.addProtocolEvent('timer', `${timer.timer} 启动`, `状态: ${state}, 定时器开始计时`);
                break;
            case 'expired':
                statusText = '超时';
                statusClass = 'expired';
                progressWidth = '100%';
                this.addProtocolEvent('timer', `${timer.timer} 超时`, `第 ${timer.retries} 次超时 (最大 ${timer.max_retries})`);
                break;
            case 'retransmit_sio':
                statusText = '重传SIO';
                statusClass = 'retrying';
                progressWidth = '30%';
                this.addProtocolEvent('timer', `${timer.timer} 重传SIO`, `第 ${timer.retries} 次重传 OUT_OF_SERVICE`);
                break;
            case 'retry_sib':
                statusText = '重传SIB';
                statusClass = 'retrying';
                progressWidth = '50%';
                this.addProtocolEvent('timer', `${timer.timer} 重传SIB`, `第 ${timer.retries} 次重传 BUSY 信号`);
                break;
            case 'acknowledged':
                statusText = '已确认';
                statusClass = 'acknowledged';
                progressWidth = '0%';
                panelClass = 'timer-panel';
                this.addProtocolEvent('timer', `${timer.timer} 已确认`, `收到确认，停止定时器`);
                break;
            case 'max_retries_exceeded':
                statusText = '超限';
                statusClass = 'expired';
                progressWidth = '100%';
                this.addProtocolEvent('timer', `${timer.timer} 超限`, `重试次数已达上限 ${timer.max_retries}，状态回退`);
                break;
        }

        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = `timer-status ${statusClass}`;
        }

        if (progressEl) {
            progressEl.style.width = progressWidth;
            progressEl.className = `timer-progress-bar ${timerLower}`;
        }

        if (panel) {
            panel.className = panelClass;
        }
    }

    handleFSNValidation(fsnResult, state) {
        if (!fsnResult) return;

        if (fsnResult.valid) {
            this.addProtocolEvent('fsn', 'FSN校验通过', `期望: ${fsnResult.expected_fsn}, 收到: ${fsnResult.received_fsn}`);
        } else {
            this.addProtocolEvent('fsn', 'FSN校验失败', `期望: <span class="highlight">${fsnResult.expected_fsn}</span>, 收到: <span class="error">${fsnResult.received_fsn}</span> → 发送SIB + 启动T3`);
            this.updateSyncStatus('OUT_OF_SYNC');
        }
    }

    addProtocolEvent(type, title, detail) {
        const event = {
            type,
            title,
            detail,
            timestamp: Date.now()
        };

        this.protocolEvents.unshift(event);

        if (this.protocolEvents.length > this.maxEvents) {
            this.protocolEvents.pop();
        }

        this.renderProtocolEvents();
    }

    addMessage(message, state, syncStatus) {
        const msg = { ...message, state };
        if (syncStatus) {
            msg.syncStatus = syncStatus;
        }

        this.messages.push(msg);

        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }

        this.renderMessages();
    }

    addTransition(transition) {
        this.transitions.unshift(transition);

        if (this.transitions.length > 50) {
            this.transitions.pop();
        }

        this.renderTransitions();
    }

    updateStats(data) {
        this.fisuCount = data.fisu_count || 0;
        this.lssuCount = data.lssu_count || 0;
        this.msuCount = data.msu_count || 0;

        this.fisuCountEl.textContent = this.fisuCount;
        this.lssuCountEl.textContent = this.lssuCount;
        this.msuCountEl.textContent = this.msuCount;
        this.totalCountEl.textContent = this.fisuCount + this.lssuCount + this.msuCount;

        if (data.sync_status) {
            this.updateSyncStatus(data.sync_status);
        }
        if (data.expected_fsn !== undefined) {
            this.expectedFSN = data.expected_fsn;
            this.expectedFSNEl.textContent = data.expected_fsn;
        }

        if (data.t1_active !== undefined) {
            this.updateTimerDisplay('t1', data.t1_active, data.t1_retries || 0);
        }
        if (data.t3_active !== undefined) {
            this.updateTimerDisplay('t3', data.t3_active, data.t3_retries || 0);
        }

        if (data.link_stats) {
            this.updateLinkStats(data.link_stats);
        }

        if (data.pcap_count !== undefined) {
            this.pcapCountEl.textContent = data.pcap_count;
        }
    }

    updateLinkStats(stats) {
        this.lostFramesEl.textContent = stats.lost_frames || 0;
        this.frameLossRateEl.textContent = (stats.frame_loss_rate || 0).toFixed(2) + '%';
        this.retransmittedEl.textContent = stats.retransmitted || 0;
        this.retransmitRateEl.textContent = (stats.retransmit_rate || 0).toFixed(2) + '%';
        this.t1RetransmissionsEl.textContent = stats.t1_retransmissions || 0;
        this.t3RetransmissionsEl.textContent = stats.t3_retransmissions || 0;

        const quality = Math.max(0, 100 - (stats.frame_loss_rate || 0) - (stats.retransmit_rate || 0));
        this.qualityFillEl.style.width = quality + '%';
        this.qualityPercentEl.textContent = quality.toFixed(1) + '%';

        if (quality >= 90) {
            this.qualityFillEl.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
            this.qualityPercentEl.style.color = '#10b981';
        } else if (quality >= 70) {
            this.qualityFillEl.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
            this.qualityPercentEl.style.color = '#f59e0b';
        } else {
            this.qualityFillEl.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
            this.qualityPercentEl.style.color = '#ef4444';
        }
    }

    exportPcap() {
        window.open('/pcap', '_blank');
    }

    updateTimerDisplay(timer, active, retries) {
        const panel = document.getElementById(`${timer}-panel`);
        const statusEl = document.getElementById(`${timer}-status`);
        const retriesEl = document.getElementById(`${timer}-retries`);
        const progressEl = document.getElementById(`${timer}-progress`);

        if (retriesEl) retriesEl.textContent = retries;

        if (active) {
            if (statusEl) {
                statusEl.textContent = '运行中';
                statusEl.className = 'timer-status running';
            }
            if (panel) {
                panel.className = `timer-panel active-${timer}`;
            }
            if (progressEl) {
                const pct = Math.min(10 + retries * 20, 90);
                progressEl.style.width = `${pct}%`;
                progressEl.className = `timer-progress-bar ${timer}`;
            }
        } else {
            if (statusEl) {
                statusEl.textContent = retries > 0 ? '已停止' : '未激活';
                statusEl.className = retries > 0 ? 'timer-status expired' : 'timer-status inactive';
            }
            if (panel) {
                panel.className = 'timer-panel';
            }
            if (progressEl) {
                progressEl.style.width = '0%';
                progressEl.className = `timer-progress-bar ${timer}`;
            }
        }
    }

    renderMessages() {
        if (this.messages.length === 0) {
            this.messageListEl.innerHTML = `
                <div class="empty-state">
                    <p>等待消息...</p>
                    <p class="hint">点击 "开始模拟" 按钮开始</p>
                </div>
            `;
            return;
        }

        this.messageListEl.innerHTML = this.messages.map((msg, index) => {
            const isSIB = msg.type === 'LSSU' && msg.status === 'BUSY';
            const typeClass = isSIB ? 'sib' : msg.type.toLowerCase();
            const selectedClass = this.selectedMessage === index ? 'selected' : '';
            const time = new Date(msg.timestamp).toLocaleTimeString();

            let info = `FSN:${msg.fsn} BSN:${msg.bsn} FIB:${msg.fib ? '1' : '0'} BIB:${msg.bib ? '1' : '0'}`;
            if (msg.status) {
                info += ` ${msg.status}`;
            }
            if (msg.si) {
                info += ` SI:${msg.si}`;
            }
            if (msg.syncStatus === 'OUT_OF_SYNC') {
                info += ` ⚠失步`;
            }

            const displayType = isSIB ? 'SIB' : msg.type;

            return `
                <div class="message-item ${typeClass} ${selectedClass}" data-index="${index}">
                    <div class="message-header">
                        <span class="message-type ${typeClass}">${displayType}</span>
                        <span class="message-seq">#${msg.sequence} | ${time}</span>
                    </div>
                    <div class="message-info">${info}</div>
                    <div class="message-hex">${msg.hex}</div>
                </div>
            `;
        }).reverse().join('');

        this.messageListEl.querySelectorAll('.message-item').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.showMessageDetail(index);
            });
        });
    }

    renderProtocolEvents() {
        if (this.protocolEvents.length === 0) {
            this.eventListEl.innerHTML = `
                <div class="empty-state">
                    <p>等待协议事件...</p>
                </div>
            `;
            return;
        }

        this.eventListEl.innerHTML = this.protocolEvents.map(event => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            const eventClass = `${event.type}-event`;
            const tagClass = event.type;

            const tagLabels = {
                timer: 'TIMER',
                fsn: 'FSN',
                sync: 'SYNC'
            };

            return `
                <div class="event-item ${eventClass}">
                    <span class="event-time">${time}</span>
                    <span class="event-tag ${tagClass}">${tagLabels[event.type] || event.type}</span>
                    <span class="event-text"><strong>${event.title}</strong> ${event.detail}</span>
                </div>
            `;
        }).join('');
    }

    renderTransitions() {
        if (this.transitions.length === 0) {
            this.transitionListEl.innerHTML = `
                <div class="empty-state">
                    <p>等待状态变迁...</p>
                </div>
            `;
            return;
        }

        this.transitionListEl.innerHTML = this.transitions.map(trans => {
            const time = new Date(trans.timestamp).toLocaleTimeString();
            return `
                <div class="transition-item">
                    <div class="transition-path">${trans.from} → ${trans.to}</div>
                    <div class="transition-reason">${trans.reason}</div>
                    <div class="transition-time">${time}</div>
                </div>
            `;
        }).join('');
    }

    showMessageDetail(index) {
        this.selectedMessage = index;
        const msg = this.messages[index];

        if (!msg) {
            this.messageDetailEl.style.display = 'none';
            return;
        }

        this.messageDetailEl.style.display = 'block';

        const time = new Date(msg.timestamp).toLocaleString();
        const isSIB = msg.type === 'LSSU' && msg.status === 'BUSY';

        let detailHtml = `
            <div class="detail-row"><span class="detail-label">类型:</span><span class="detail-value">${isSIB ? 'LSSU (SIB)' : msg.type}</span></div>
            <div class="detail-row"><span class="detail-label">序列号:</span><span class="detail-value">${msg.sequence}</span></div>
            <div class="detail-row"><span class="detail-label">时间:</span><span class="detail-value">${time}</span></div>
            <div class="detail-row"><span class="detail-label">状态:</span><span class="detail-value">${msg.state}</span></div>
            <div class="detail-row"><span class="detail-label">同步:</span><span class="detail-value">${msg.syncStatus || 'IN_SYNC'}</span></div>
            <div class="detail-row"><span class="detail-label">FSN:</span><span class="detail-value">${msg.fsn}</span></div>
            <div class="detail-row"><span class="detail-label">BSN:</span><span class="detail-value">${msg.bsn}</span></div>
            <div class="detail-row"><span class="detail-label">FIB:</span><span class="detail-value">${msg.fib ? '1 (True)' : '0 (False)'}</span></div>
            <div class="detail-row"><span class="detail-label">BIB:</span><span class="detail-value">${msg.bib ? '1 (True)' : '0 (False)'}</span></div>
            <div class="detail-row"><span class="detail-label">长度:</span><span class="detail-value">${msg.length} 字节</span></div>
        `;

        if (msg.status) {
            detailHtml += `<div class="detail-row"><span class="detail-label">LSSU状态:</span><span class="detail-value">${msg.status}</span></div>`;
        }

        if (msg.si) {
            detailHtml += `
                <div class="detail-row"><span class="detail-label">SI:</span><span class="detail-value">${msg.si}</span></div>
                <div class="detail-row"><span class="detail-label">SIO:</span><span class="detail-value">0x${msg.sio.toString(16).padStart(2, '0')}</span></div>
            `;
        }

        if (msg.payload) {
            detailHtml += `<div class="detail-row"><span class="detail-label">Payload:</span><span class="detail-value hex">${msg.payload}</span></div>`;
        }

        detailHtml += `<div class="detail-row"><span class="detail-label">Hex:</span><span class="detail-value hex">${msg.hex}</span></div>`;

        this.detailContentEl.innerHTML = detailHtml;
        this.renderMessages();
    }

    reset() {
        this.messages = [];
        this.transitions = [];
        this.protocolEvents = [];
        this.selectedMessage = null;
        this.fisuCount = 0;
        this.lssuCount = 0;
        this.msuCount = 0;
        this.syncStatus = 'IN_SYNC';
        this.expectedFSN = 0;

        this.updateSyncStatus('IN_SYNC');
        this.expectedFSNEl.textContent = '0';
        this.updateStats({ fisu_count: 0, lssu_count: 0, msu_count: 0 });
        this.updateLinkStats({ lost_frames: 0, frame_loss_rate: 0, retransmitted: 0, retransmit_rate: 0, t1_retransmissions: 0, t3_retransmissions: 0 });
        this.pcapCountEl.textContent = '0';
        this.updateTimerDisplay('t1', false, 0);
        this.updateTimerDisplay('t3', false, 0);
        this.renderMessages();
        this.renderProtocolEvents();
        this.renderTransitions();
        this.messageDetailEl.style.display = 'none';

        this.sendAction('reset');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new MTP2Simulator();
});
