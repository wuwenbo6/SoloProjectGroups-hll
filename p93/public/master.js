class RemoteControlMaster {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.currentAgentId = null;
        this.localStream = null;
        this.eventCount = 0;
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.lastMouseMoveTime = 0;
        this.mouseMoveThrottle = 8;
        this.agentScreenInfo = new Map();
        
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        
        this.selectedFile = null;
        this.fileChunkSize = 16384;
        this.isSendingFile = false;

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.roomIdInput = document.getElementById('roomId');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.screenSection = document.getElementById('screenSection');
        this.startScreenBtn = document.getElementById('startScreenBtn');
        this.stopScreenBtn = document.getElementById('stopScreenBtn');
        this.displaySelector = document.getElementById('displaySelector');
        this.toolsSection = document.getElementById('toolsSection');
        this.startRecordBtn = document.getElementById('startRecordBtn');
        this.stopRecordBtn = document.getElementById('stopRecordBtn');
        this.recordStatus = document.getElementById('recordStatus');
        this.fileInput = document.getElementById('fileInput');
        this.selectFileBtn = document.getElementById('selectFileBtn');
        this.sendFileBtn = document.getElementById('sendFileBtn');
        this.fileName = document.getElementById('fileName');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.agentsSection = document.getElementById('agentsSection');
        this.refreshAgentsBtn = document.getElementById('refreshAgentsBtn');
        this.agentsList = document.getElementById('agentsList');
        this.controlSection = document.getElementById('controlSection');
        this.channelStatus = document.getElementById('channelStatus');
        this.eventCountEl = document.getElementById('eventCount');
        this.currentAgentEl = document.getElementById('currentAgent');
        this.screenContainer = document.getElementById('screenContainer');
        this.screenVideo = document.getElementById('screen-video');
        this.logsEl = document.getElementById('logs');
    }

    initEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.startScreenBtn.addEventListener('click', () => this.startScreenShare());
        this.stopScreenBtn.addEventListener('click', () => this.stopScreenShare());
        this.refreshAgentsBtn.addEventListener('click', () => this.getAgentsList());
        
        this.startRecordBtn.addEventListener('click', () => this.startRecording());
        this.stopRecordBtn.addEventListener('click', () => this.stopRecording());
        this.selectFileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.sendFileBtn.addEventListener('click', () => this.sendFile());

        this.screenVideo.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.screenVideo.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.screenVideo.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.screenVideo.addEventListener('wheel', (e) => this.handleWheel(e));
        this.screenVideo.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    log(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">${time}</span><span class="log-${type}">${message}</span>`;
        this.logsEl.appendChild(entry);
        this.logsEl.scrollTop = this.logsEl.scrollHeight;
    }

    generateRoomId() {
        return 'room-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    connectToServer() {
        if (this.socket && this.socket.connected) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.socket = io();
            
            this.socket.on('connect', () => {
                this.log('已连接到信令服务器', 'success');
                this.updateStatus('connected', '已连接');
                resolve();
            });

            this.socket.on('disconnect', () => {
                this.log('与信令服务器断开连接', 'error');
                this.updateStatus('disconnected', '未连接');
            });

            this.socket.on('error', (msg) => {
                this.log('错误: ' + msg, 'error');
                reject(msg);
            });

            this.socket.on('agent-connected', (agentId) => {
                this.log(`被控端已连接: ${agentId.substring(0, 8)}`, 'success');
                this.addAgentToList(agentId);
            });

            this.socket.on('agent-disconnected', (agentId) => {
                this.log(`被控端断开连接: ${agentId.substring(0, 8)}`, 'error');
                this.removeAgentFromList(agentId);
                this.closePeerConnection(agentId);
            });

            this.socket.on('agents-list', (agents) => {
                this.updateAgentsList(agents);
            });

            this.socket.on('offer', async (data) => {
                await this.handleOffer(data);
            });

            this.socket.on('answer', (data) => {
                this.handleAnswer(data);
            });

            this.socket.on('ice-candidate', (data) => {
                this.handleIceCandidate(data);
            });
        });
    }

    updateStatus(status, text) {
        this.connectionStatus.className = `status ${status}`;
        this.connectionStatus.textContent = text;
    }

    async createRoom() {
        const roomId = this.roomIdInput.value || this.generateRoomId();
        await this.connectToServer();
        
        this.socket.emit('create-room', roomId);
        this.socket.once('room-created', async (id) => {
            this.roomId = id;
            this.roomIdInput.value = id;
            this.log(`房间已创建: ${id}`, 'success');
            
            this.socket.emit('join-room', id, 'master');
            this.socket.once('joined-room', () => {
                this.log('已作为主控端加入房间', 'success');
                this.screenSection.classList.remove('hidden');
                this.agentsSection.classList.remove('hidden');
                this.toolsSection.classList.remove('hidden');
            });
        });
    }

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.log('请输入房间ID', 'error');
            return;
        }

        await this.connectToServer();
        this.socket.emit('join-room', roomId, 'master');
        
        this.socket.once('joined-room', () => {
            this.roomId = roomId;
            this.log(`已加入房间: ${roomId}`, 'success');
            this.screenSection.classList.remove('hidden');
            this.agentsSection.classList.remove('hidden');
            this.toolsSection.classList.remove('hidden');
            this.getAgentsList();
        });

        this.socket.once('error', (msg) => {
            this.log(msg, 'error');
        });
    }

    getAgentsList() {
        if (this.roomId) {
            this.socket.emit('get-agents', this.roomId);
        }
    }

    updateAgentsList(agents) {
        this.agentsList.innerHTML = '';
        agents.forEach(agentId => {
            this.addAgentToList(agentId);
        });
    }

    addAgentToList(agentId) {
        const item = document.createElement('div');
        item.className = 'agent-item';
        item.dataset.agentId = agentId;
        item.innerHTML = `
            <span class="agent-id">${agentId.substring(0, 8)}...</span>
            <button class="btn-secondary" onclick="master.connectToAgent('${agentId}')">连接</button>
        `;
        this.agentsList.appendChild(item);
    }

    removeAgentFromList(agentId) {
        const item = this.agentsList.querySelector(`[data-agent-id="${agentId}"]`);
        if (item) item.remove();
    }

    async startScreenShare() {
        try {
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always'
                },
                audio: false
            });

            this.screenVideo.srcObject = this.localStream;
            this.screenContainer.classList.remove('hidden');
            this.startScreenBtn.classList.add('hidden');
            this.stopScreenBtn.classList.remove('hidden');
            this.controlSection.classList.remove('hidden');

            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenShare();
            });

            this.screenVideo.onloadedmetadata = () => {
                this.updateScreenResolution();
            };

            this.screenVideo.onresize = () => {
                this.updateScreenResolution();
            };

            this.log('屏幕共享已开始', 'success');
        } catch (err) {
            this.log('屏幕共享失败: ' + err.message, 'error');
        }
    }

    updateScreenResolution() {
        const newWidth = this.screenVideo.videoWidth;
        const newHeight = this.screenVideo.videoHeight;
        
        if (newWidth !== this.screenWidth || newHeight !== this.screenHeight) {
            this.screenWidth = newWidth;
            this.screenHeight = newHeight;
            this.log(`屏幕分辨率更新: ${this.screenWidth}x${this.screenHeight}`, 'info');
            
            this.dataChannels.forEach((channel) => {
                this.sendScreenInfo(channel);
            });
            
            this.adjustVideoContainer();
        }
    }

    adjustVideoContainer() {
        if (this.screenWidth && this.screenHeight) {
            const aspectRatio = this.screenWidth / this.screenHeight;
            this.screenVideo.style.aspectRatio = `${aspectRatio}`;
        }
    }

    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.screenVideo.srcObject = null;
        this.screenContainer.classList.add('hidden');
        this.startScreenBtn.classList.remove('hidden');
        this.stopScreenBtn.classList.add('hidden');
        this.controlSection.classList.add('hidden');
        this.log('屏幕共享已停止', 'info');
    }

    async connectToAgent(agentId) {
        if (this.peerConnections.has(agentId)) {
            this.log('已连接到此被控端', 'info');
            return;
        }

        this.log(`正在连接到被控端: ${agentId.substring(0, 8)}`, 'info');

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        this.peerConnections.set(agentId, pc);

        const dataChannel = pc.createDataChannel('input-events', {
            ordered: true
        });

        this.setupDataChannel(dataChannel, agentId);
        this.dataChannels.set(agentId, dataChannel);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: agentId,
                    candidate: event.candidate,
                    roomId: this.roomId
                });
            }
        };

        pc.onconnectionstatechange = () => {
            this.log(`连接状态: ${pc.connectionState}`, 'info');
            if (pc.connectionState === 'connected') {
                this.currentAgentId = agentId;
                this.currentAgentEl.textContent = agentId.substring(0, 8);
                const item = this.agentsList.querySelector(`[data-agent-id="${agentId}"]`);
                if (item) item.classList.add('active');
                
                if (this.selectedFile) {
                    this.sendFileBtn.disabled = false;
                }
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        this.socket.emit('offer', {
            targetId: agentId,
            offer: offer,
            roomId: this.roomId
        });
    }

    setupDataChannel(channel, agentId) {
        channel.onopen = () => {
            this.log(`DataChannel已打开 (${agentId.substring(0, 8)})`, 'success');
            this.channelStatus.textContent = '已连接';
            this.channelStatus.style.color = '#2ecc71';
            
            this.sendScreenInfo(channel);
        };

        channel.onclose = () => {
            this.log(`DataChannel已关闭 (${agentId.substring(0, 8)})`, 'error');
            this.channelStatus.textContent = '已关闭';
            this.channelStatus.style.color = '#e74c3c';
        };

        channel.onerror = (err) => {
            this.log(`DataChannel错误: ${err}`, 'error');
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'screen-info') {
                    this.agentScreenInfo.set(agentId, {
                        width: data.width,
                        height: data.height
                    });
                    this.log(`被控端屏幕分辨率: ${data.width}x${data.height}`, 'info');
                }
            } catch (err) {
                console.error('解析消息失败:', err);
            }
        };
    }

    sendScreenInfo(channel) {
        if (this.screenWidth && this.screenHeight && channel.readyState === 'open') {
            channel.send(JSON.stringify({
                type: 'screen-info',
                width: this.screenWidth,
                height: this.screenHeight
            }));
        }
    }

    async handleOffer(data) {
        const { offer, from } = data;
        let pc = this.peerConnections.get(from);

        if (!pc) {
            pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            this.peerConnections.set(from, pc);

            pc.ondatachannel = (event) => {
                this.setupDataChannel(event.channel, from);
                this.dataChannels.set(from, event.channel);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        targetId: from,
                        candidate: event.candidate,
                        roomId: this.roomId
                    });
                }
            };

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('answer', {
            targetId: from,
            answer: answer,
            roomId: this.roomId
        });
    }

    handleAnswer(data) {
        const { answer, from } = data;
        const pc = this.peerConnections.get(from);
        if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    handleIceCandidate(data) {
        const { candidate, from } = data;
        const pc = this.peerConnections.get(from);
        if (pc && candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    closePeerConnection(agentId) {
        const pc = this.peerConnections.get(agentId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(agentId);
        }
        const dc = this.dataChannels.get(agentId);
        if (dc) {
            dc.close();
            this.dataChannels.delete(agentId);
        }
        if (this.currentAgentId === agentId) {
            this.currentAgentId = null;
            this.currentAgentEl.textContent = '-';
            this.channelStatus.textContent = '未连接';
            this.channelStatus.style.color = '';
            this.sendFileBtn.disabled = true;
        }
    }

    sendEvent(event) {
        if (!this.currentAgentId) return;
        
        const channel = this.dataChannels.get(this.currentAgentId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(event));
            this.eventCount++;
            this.eventCountEl.textContent = this.eventCount;
        }
    }

    getMousePosition(e) {
        const rect = this.screenVideo.getBoundingClientRect();
        
        const normalizedX = (e.clientX - rect.left) / rect.width;
        const normalizedY = (e.clientY - rect.top) / rect.height;
        
        return {
            x: Math.max(0, Math.min(1, normalizedX)),
            y: Math.max(0, Math.min(1, normalizedY)),
            absoluteX: Math.round(normalizedX * this.screenWidth),
            absoluteY: Math.round(normalizedY * this.screenHeight)
        };
    }

    handleMouseMove(e) {
        if (!this.screenWidth) return;
        
        const now = Date.now();
        if (now - this.lastMouseMoveTime < this.mouseMoveThrottle) {
            return;
        }
        this.lastMouseMoveTime = now;
        
        const pos = this.getMousePosition(e);
        this.sendEvent({
            type: 'mousemove',
            x: pos.x,
            y: pos.y,
            normalized: true
        });
    }

    handleMouseDown(e) {
        e.preventDefault();
        const pos = this.getMousePosition(e);
        const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
        this.sendEvent({
            type: 'mousedown',
            x: pos.x,
            y: pos.y,
            button: button,
            normalized: true
        });
    }

    handleMouseUp(e) {
        e.preventDefault();
        const pos = this.getMousePosition(e);
        const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
        this.sendEvent({
            type: 'mouseup',
            x: pos.x,
            y: pos.y,
            button: button,
            normalized: true
        });
    }

    handleWheel(e) {
        e.preventDefault();
        this.sendEvent({
            type: 'scroll',
            deltaX: e.deltaX,
            deltaY: e.deltaY
        });
    }

    handleKeyDown(e) {
        if (!this.currentAgentId) return;
        this.sendEvent({
            type: 'keydown',
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        });
    }

    handleKeyUp(e) {
        if (!this.currentAgentId) return;
        this.sendEvent({
            type: 'keyup',
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        });
    }

    startRecording() {
        if (!this.localStream) {
            this.log('请先开始屏幕共享', 'error');
            return;
        }

        try {
            this.recordedChunks = [];
            const options = { mimeType: 'video/webm;codecs=vp9' };
            
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                this.log('VP9 codec not supported, falling back to default', 'info');
                this.mediaRecorder = new MediaRecorder(this.localStream);
            } else {
                this.mediaRecorder = new MediaRecorder(this.localStream, options);
            }

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.downloadRecording();
            };

            this.mediaRecorder.start(1000);
            this.isRecording = true;
            
            this.startRecordBtn.classList.add('hidden');
            this.stopRecordBtn.classList.remove('hidden');
            this.recordStatus.classList.remove('hidden');
            
            this.log('开始录制会话', 'success');
        } catch (err) {
            this.log('录制失败: ' + err.message, 'error');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            this.startRecordBtn.classList.remove('hidden');
            this.stopRecordBtn.classList.add('hidden');
            this.recordStatus.classList.add('hidden');
            
            this.log('录制已停止，正在生成下载...', 'info');
        }
    }

    downloadRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `remote-session-${timestamp}.webm`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.log(`录制已保存 (${this.formatFileSize(blob.size)})`, 'success');
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.selectedFile = file;
            this.fileName.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
            this.sendFileBtn.disabled = !this.currentAgentId;
            this.log(`已选择文件: ${file.name}`, 'info');
        }
    }

    async sendFile() {
        if (!this.selectedFile || !this.currentAgentId || this.isSendingFile) return;

        const channel = this.dataChannels.get(this.currentAgentId);
        if (!channel || channel.readyState !== 'open') {
            this.log('DataChannel未连接', 'error');
            return;
        }

        this.isSendingFile = true;
        this.sendFileBtn.disabled = true;
        this.progressBar.classList.remove('hidden');

        const file = this.selectedFile;
        const totalChunks = Math.ceil(file.size / this.fileChunkSize);
        let currentChunk = 0;

        this.log(`开始发送文件: ${file.name}`, 'info');

        channel.send(JSON.stringify({
            type: 'file-start',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: totalChunks
        }));

        const reader = new FileReader();
        
        const sendNextChunk = () => {
            const start = currentChunk * this.fileChunkSize;
            const end = Math.min(start + this.fileChunkSize, file.size);
            const blob = file.slice(start, end);
            reader.readAsArrayBuffer(blob);
        };

        reader.onload = (e) => {
            try {
                channel.send(e.target.result);
                currentChunk++;
                
                const progress = Math.round((currentChunk / totalChunks) * 100);
                this.progressFill.style.width = progress + '%';
                this.progressText.textContent = progress + '%';

                if (currentChunk < totalChunks) {
                    setTimeout(sendNextChunk, 0);
                } else {
                    channel.send(JSON.stringify({
                        type: 'file-end',
                        fileName: file.name
                    }));
                    
                    this.log(`文件发送完成: ${file.name}`, 'success');
                    this.isSendingFile = false;
                    this.sendFileBtn.disabled = false;
                    
                    setTimeout(() => {
                        this.progressBar.classList.add('hidden');
                        this.progressFill.style.width = '0%';
                        this.progressText.textContent = '0%';
                    }, 2000);
                }
            } catch (err) {
                this.log('发送文件失败: ' + err.message, 'error');
                this.isSendingFile = false;
                this.sendFileBtn.disabled = false;
            }
        };

        reader.onerror = () => {
            this.log('读取文件失败', 'error');
            this.isSendingFile = false;
            this.sendFileBtn.disabled = false;
        };

        sendNextChunk();
    }

    setupDataChannelFileHandler(channel) {
        channel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                const data = JSON.parse(event.data);
                if (data.type === 'screen-info') {
                    this.log(`被控端屏幕分辨率: ${data.width}x${data.height}`, 'info');
                }
            }
        };
    }
}

const master = new RemoteControlMaster();