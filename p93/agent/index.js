const io = require('socket.io-client');
const wrtc = require('wrtc');
const robot = require('robotjs');

const SIGNALING_SERVER = process.env.SIGNALING_SERVER || 'http://localhost:3000';
const ROOM_ID = process.env.ROOM_ID || 'test-room';

const fs = require('fs');
const path = require('path');

class RemoteControlAgent {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.masterId = null;
        this.roomId = null;
        this.screenSize = robot.getScreenSize();
        
        this.receivingFile = false;
        this.receivedFileChunks = [];
        this.currentFileInfo = null;
        this.receivedChunks = 0;
        
        console.log(`屏幕分辨率: ${this.screenSize.width}x${this.screenSize.height}`);
    }

    connect() {
        console.log(`连接到信令服务器: ${SIGNALING_SERVER}`);
        
        this.socket = io(SIGNALING_SERVER, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        this.socket.on('connect', () => {
            console.log('已连接到信令服务器, Socket ID:', this.socket.id);
            this.joinRoom();
        });

        this.socket.on('disconnect', () => {
            console.log('与信令服务器断开连接');
            this.cleanup();
        });

        this.socket.on('error', (msg) => {
            console.error('错误:', msg);
        });

        this.socket.on('master-connected', () => {
            console.log('主控端已连接到房间');
        });

        this.socket.on('master-disconnected', () => {
            console.log('主控端已断开连接');
            this.cleanup();
        });

        this.socket.on('offer', async (data) => {
            console.log('收到来自主控端的Offer');
            await this.handleOffer(data);
        });

        this.socket.on('answer', (data) => {
            console.log('收到Answer');
            this.handleAnswer(data);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });

        this.socket.on('connect_error', (err) => {
            console.error('连接错误:', err.message);
        });
    }

    joinRoom() {
        this.roomId = ROOM_ID;
        console.log(`加入房间: ${this.roomId}`);
        this.socket.emit('join-room', this.roomId, 'agent');
        
        this.socket.once('joined-room', (data) => {
            console.log(`已作为被控端加入房间: ${data.roomId}`);
        });

        this.socket.once('error', (msg) => {
            console.error('加入房间失败:', msg);
        });
    }

    async handleOffer(data) {
        const { offer, from, roomId } = data;
        this.masterId = from;

        this.peerConnection = new wrtc.RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        this.peerConnection.ondatachannel = (event) => {
            console.log('DataChannel已建立');
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: from,
                    candidate: event.candidate,
                    roomId: roomId
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('连接状态:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                console.log('WebRTC连接已建立!');
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('收到视频流');
        };

        await this.peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.socket.emit('answer', {
            targetId: from,
            answer: answer,
            roomId: roomId
        });

        console.log('已发送Answer');
    }

    handleAnswer(data) {
        const { answer } = data;
        if (this.peerConnection) {
            this.peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
        }
    }

    handleIceCandidate(data) {
        const { candidate } = data;
        if (this.peerConnection && candidate) {
            this.peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(candidate));
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('DataChannel已打开, 准备接收控制指令');
            this.sendScreenInfo();
        };

        this.dataChannel.onclose = () => {
            console.log('DataChannel已关闭');
        };

        this.dataChannel.onerror = (err) => {
            console.error('DataChannel错误:', err);
        };

        this.dataChannel.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer || event.data instanceof Buffer) {
                this.handleFileChunk(event.data);
            } else {
                try {
                    const inputEvent = JSON.parse(event.data);
                    this.handleInputEvent(inputEvent);
                } catch (err) {
                    console.error('解析事件失败:', err);
                }
            }
        };
    }

    sendScreenInfo() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'screen-info',
                width: this.screenSize.width,
                height: this.screenSize.height
            }));
        }
    }

    handleInputEvent(event) {
        switch (event.type) {
            case 'screen-info':
                console.log(`主控端屏幕分辨率: ${event.width}x${event.height}`);
                break;
            case 'file-start':
                this.handleFileStart(event);
                break;
            case 'file-end':
                this.handleFileEnd(event);
                break;
            case 'mousemove':
                this.handleMouseMove(event);
                break;
            case 'mousedown':
                this.handleMouseDown(event);
                break;
            case 'mouseup':
                this.handleMouseUp(event);
                break;
            case 'scroll':
                this.handleScroll(event);
                break;
            case 'keydown':
                this.handleKeyDown(event);
                break;
            case 'keyup':
                this.handleKeyUp(event);
                break;
        }
    }

    handleFileStart(event) {
        console.log(`接收文件开始: ${event.fileName} (${this.formatFileSize(event.fileSize)})`);
        this.receivingFile = true;
        this.currentFileInfo = event;
        this.receivedFileChunks = [];
        this.receivedChunks = 0;
    }

    handleFileChunk(chunk) {
        if (!this.receivingFile) return;
        
        this.receivedFileChunks.push(Buffer.from(chunk));
        this.receivedChunks++;
        
        if (this.currentFileInfo && this.currentFileInfo.totalChunks) {
            const progress = Math.round((this.receivedChunks / this.currentFileInfo.totalChunks) * 100);
            if (progress % 10 === 0) {
                console.log(`文件接收进度: ${progress}%`);
            }
        }
    }

    handleFileEnd(event) {
        if (!this.receivingFile || !this.currentFileInfo) return;
        
        try {
            const fileBuffer = Buffer.concat(this.receivedFileChunks);
            const fileName = this.currentFileInfo.fileName;
            const savePath = path.join(process.cwd(), 'received_' + fileName);
            
            fs.writeFileSync(savePath, fileBuffer);
            
            console.log(`文件已保存: ${savePath} (${this.formatFileSize(fileBuffer.length)})`);
            
            this.receivingFile = false;
            this.receivedFileChunks = [];
            this.currentFileInfo = null;
            this.receivedChunks = 0;
        } catch (err) {
            console.error('保存文件失败:', err);
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    convertToAbsoluteCoords(event) {
        let x, y;
        
        if (event.normalized) {
            x = Math.round(event.x * this.screenSize.width);
            y = Math.round(event.y * this.screenSize.height);
        } else {
            x = Math.round(event.x);
            y = Math.round(event.y);
        }
        
        x = Math.max(0, Math.min(this.screenSize.width - 1, x));
        y = Math.max(0, Math.min(this.screenSize.height - 1, y));
        
        return { x, y };
    }

    handleMouseMove(event) {
        try {
            const { x, y } = this.convertToAbsoluteCoords(event);
            robot.moveMouse(x, y);
        } catch (err) {
            console.error('鼠标移动失败:', err);
        }
    }

    handleMouseDown(event) {
        try {
            const { x, y } = this.convertToAbsoluteCoords(event);
            const { button } = event;
            robot.moveMouse(x, y);
            robot.mouseToggle('down', button);
            console.log(`鼠标按下: ${button} (${x}, ${y})`);
        } catch (err) {
            console.error('鼠标按下失败:', err);
        }
    }

    handleMouseUp(event) {
        try {
            const { x, y } = this.convertToAbsoluteCoords(event);
            const { button } = event;
            robot.moveMouse(x, y);
            robot.mouseToggle('up', button);
            console.log(`鼠标释放: ${button} (${x}, ${y})`);
        } catch (err) {
            console.error('鼠标释放失败:', err);
        }
    }

    handleScroll(event) {
        try {
            const { deltaX, deltaY } = event;
            const scrollX = Math.round(deltaX / 10);
            const scrollY = Math.round(deltaY / 10);
            
            if (scrollY !== 0) {
                robot.scrollMouse(Math.abs(scrollY), scrollY > 0 ? 'down' : 'up');
            }
        } catch (err) {
            console.error('滚动失败:', err);
        }
    }

    keyCodeMap = {
        'Backspace': 'backspace',
        'Tab': 'tab',
        'Enter': 'enter',
        'Shift': 'shift',
        'Control': 'control',
        'Alt': 'alt',
        'Meta': 'command',
        'CapsLock': 'capslock',
        'Escape': 'escape',
        'Space': 'space',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        'PageUp': 'pageup',
        'PageDown': 'pagedown',
        'End': 'end',
        'Home': 'home',
        'Insert': 'insert',
        'Delete': 'delete',
        'F1': 'f1',
        'F2': 'f2',
        'F3': 'f3',
        'F4': 'f4',
        'F5': 'f5',
        'F6': 'f6',
        'F7': 'f7',
        'F8': 'f8',
        'F9': 'f9',
        'F10': 'f10',
        'F11': 'f11',
        'F12': 'f12',
        'NumLock': 'numlock',
        'ScrollLock': 'scrolllock',
        'Semicolon': ';',
        'Equal': '=',
        'Comma': ',',
        'Minus': '-',
        'Period': '.',
        'Slash': '/',
        'Backquote': '`',
        'BracketLeft': '[',
        'Backslash': '\\',
        'BracketRight': ']',
        'Quote': '\''
    };

    mapKey(code) {
        if (code.startsWith('Key')) {
            return code.slice(3).toLowerCase();
        }
        if (code.startsWith('Digit')) {
            return code.slice(5);
        }
        if (code.startsWith('Numpad')) {
            return code.slice(6);
        }
        return this.keyCodeMap[code] || code;
    }

    handleKeyDown(event) {
        try {
            const key = this.mapKey(event.code);
            if (key) {
                const modifiers = [];
                if (event.ctrlKey) modifiers.push('control');
                if (event.shiftKey) modifiers.push('shift');
                if (event.altKey) modifiers.push('alt');
                if (event.metaKey) modifiers.push('command');

                if (modifiers.length > 0) {
                    robot.keyTap(key, modifiers);
                } else {
                    robot.keyTap(key);
                }
                console.log(`按键按下: ${key}`, modifiers.length > 0 ? `+ ${modifiers.join('+')}` : '');
            }
        } catch (err) {
            console.error('按键失败:', err);
        }
    }

    handleKeyUp(event) {
    }

    cleanup() {
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            } catch (e) {}
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            try {
                this.peerConnection.close();
            } catch (e) {}
            this.peerConnection = null;
        }
        this.masterId = null;
    }
}

const agent = new RemoteControlAgent();
agent.connect();

process.on('SIGINT', () => {
    console.log('\n正在关闭...');
    agent.cleanup();
    if (agent.socket) {
        agent.socket.disconnect();
    }
    process.exit(0);
});