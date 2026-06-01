const express = require('express');
const http = require('http');
const dgram = require('dgram');
const WebSocket = require('ws');
const path = require('path');

const DRONE_IP = '192.168.1.1';
const DRONE_AT_PORT = 5556;
const VIDEO_PORT = 5555;
const NAV_PORT = 5554;
const SERVER_PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const atSocket = dgram.createSocket('udp4');
const videoSocket = dgram.createSocket('udp4');
const navSocket = dgram.createSocket('udp4');

let sequence = 1;
let connectedClients = new Set();

let currentNavData = null;
let lastNavDataTime = 0;

let frameBuffer = [];
let hasSPS = false;
let hasPPS = false;
let spsData = null;
let ppsData = null;
let waitingForIFrame = true;
let currentFrameData = [];

function sendAtCommand(command) {
    const fullCommand = `${command}\r`;
    const message = Buffer.from(fullCommand);
    atSocket.send(message, 0, message.length, DRONE_AT_PORT, DRONE_IP, (err) => {
        if (err) {
            console.error(`AT命令发送失败: ${err.message}`);
        } else {
            console.log(`发送AT命令: ${command}`);
        }
    });
}

function formatFloat(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value, 0);
    return buffer.readInt32LE(0);
}

atSocket.on('error', (err) => {
    console.error(`AT Socket 错误: ${err.message}`);
});

videoSocket.on('error', (err) => {
    console.error(`Video Socket 错误: ${err.message}`);
});

navSocket.on('error', (err) => {
    console.error(`Nav Socket 错误: ${err.message}`);
});

videoSocket.on('message', (msg) => {
    if (connectedClients.size === 0) return;

    const nalus = parseNalus(msg);

    for (const nalu of nalus) {
        const naluType = nalu[0] & 0x1F;

        if (naluType === 7) {
            hasSPS = true;
            spsData = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x01]), nalu]);
            console.log('收到SPS帧');
        } else if (naluType === 8) {
            hasPPS = true;
            ppsData = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x01]), nalu]);
            console.log('收到PPS帧');
        } else if (naluType === 5) {
            if (hasSPS && hasPPS) {
                waitingForIFrame = false;
                const idrFrame = Buffer.concat([
                    Buffer.from([0x00, 0x00, 0x00, 0x01]),
                    nalu
                ]);

                const completeFrame = Buffer.concat([spsData, ppsData, idrFrame]);

                broadcastVideoFrame(completeFrame);
                console.log('IDR帧已发送，开始解码');
            }
        } else if (naluType === 1 || naluType === 2 || naluType === 3 || naluType === 4) {
            if (!waitingForIFrame && hasSPS && hasPPS) {
                const frame = Buffer.concat([
                    Buffer.from([0x00, 0x00, 0x00, 0x01]),
                    nalu
                ]);
                broadcastVideoFrame(frame);
            }
        }
    }
});

function parseNalus(buffer) {
    const nalus = [];
    let start = 0;
    const startCode = Buffer.from([0x00, 0x00, 0x00, 0x01]);
    const shortStartCode = Buffer.from([0x00, 0x00, 0x01]);

    while (start < buffer.length) {
        let idx = buffer.indexOf(startCode, start);
        if (idx === -1) {
            idx = buffer.indexOf(shortStartCode, start);
            if (idx === -1) break;
            start = idx + 3;
        } else {
            start = idx + 4;
        }

        let nextIdx = buffer.indexOf(startCode, start);
        if (nextIdx === -1) {
            nextIdx = buffer.indexOf(shortStartCode, start);
        }

        const end = nextIdx !== -1 ? nextIdx : buffer.length;
        if (start < end) {
            nalus.push(buffer.slice(start, end));
        }
        start = end;
    }

    return nalus;
}

function broadcastVideoFrame(frameData) {
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'video',
                data: frameData.toString('base64')
            }));
        }
    });
}

navSocket.on('message', (msg) => {
    currentNavData = parseNavData(msg);
    lastNavDataTime = Date.now();

    if (connectedClients.size > 0) {
        connectedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'nav',
                    data: currentNavData
                }));
            }
        });
    }
});

function parseNavData(buffer) {
    if (buffer.length < 16) return null;
    const header = buffer.readUInt32LE(0);
    const state = buffer.readUInt32LE(4);
    const seq = buffer.readUInt32LE(8);
    const visionFlag = buffer.readUInt32LE(12);

    const controlState = (state >> 21) & 0xF;

    const controlStates = {
        0: 'DEFAULT',
        1: 'INIT',
        2: 'LANDED',
        3: 'FLYING',
        4: 'HOVERING',
        5: 'TEST',
        6: 'TAKING_OFF',
        7: 'FLYING',
        8: 'LANDING',
        9: 'LOOPING'
    };

    let batteryVoltage = null;
    let altitude = null;
    let velocity = { x: 0, y: 0, z: 0 };

    if (buffer.length >= 44) {
        const numTags = buffer.readUInt32LE(16);
        let offset = 20;

        for (let i = 0; i < numTags && offset < buffer.length - 4; i++) {
            const tagId = buffer.readUInt16LE(offset);
            const tagSize = buffer.readUInt16LE(offset + 2);

            if (tagSize <= 0 || offset + tagSize > buffer.length) break;

            switch (tagId) {
                case 0:
                    if (tagSize >= 80 && offset + tagSize <= buffer.length) {
                        const ctrlState = buffer.readUInt32LE(offset + 4);
                        const batteryMV = buffer.readUInt16LE(offset + 24);
                        const pitchDeg = buffer.readFloatLE(offset + 28);
                        const rollDeg = buffer.readFloatLE(offset + 32);
                        const yawDeg = buffer.readFloatLE(offset + 36);
                        altitude = buffer.readInt32LE(offset + 40);
                        velocity.x = buffer.readFloatLE(offset + 48);
                        velocity.y = buffer.readFloatLE(offset + 52);
                        velocity.z = buffer.readFloatLE(offset + 56);

                        batteryVoltage = batteryMV / 1000.0;
                    }
                    break;
                case 1:
                    if (tagSize >= 44 && offset + tagSize <= buffer.length) {
                        const pressure = buffer.readFloatLE(offset + 4);
                        const temp = buffer.readFloatLE(offset + 8);
                        const rawAlt = buffer.readFloatLE(offset + 12);
                        altitude = rawAlt;
                    }
                    break;
            }

            offset += tagSize;
        }
    }

    return {
        header,
        state,
        sequence: seq,
        visionFlag,
        flying: (state >> 0) & 1,
        videoEnabled: (state >> 1) & 1,
        visionEnabled: (state >> 2) & 1,
        controlAlgorithm: (state >> 3) & 1,
        altitudeControlActive: (state >> 4) & 1,
        userFeedbackOn: (state >> 5) & 1,
        controlReceived: (state >> 6) & 1,
        trimReceived: (state >> 7) & 1,
        trimRunning: (state >> 8) & 1,
        trimSucceeded: (state >> 9) & 1,
        navDataDemoOnly: (state >> 10) & 1,
        navDataBootstrap: (state >> 11) & 1,
        motorsDown: (state >> 12) & 1,
        gyroDown: (state >> 13) & 1,
        batteryTooLow: (state >> 15) & 1,
        batteryTooHigh: (state >> 16) & 1,
        timerElapsed: (state >> 17) & 1,
        notEnoughPower: (state >> 18) & 1,
        anglesOutOfRange: (state >> 19) & 1,
        tooMuchWind: (state >> 20) & 1,
        angleEmergency: (state >> 21) & 1,
        controlState: controlState,
        controlStateName: controlStates[controlState] || 'UNKNOWN',
        outdoorMode: ((state >> 25) & 1) === 1,
        comLost: (state >> 26) & 1,
        vbatLow: (state >> 27) & 1,
        userEmergencyLanding: (state >> 28) & 1,
        timerElapsed2: (state >> 29) & 1,
        magnetoCalibrationState: (state >> 30) & 3,
        batteryVoltage: batteryVoltage,
        altitude: altitude,
        velocity: velocity
    };
}

wss.on('connection', (ws) => {
    console.log('客户端已连接');
    connectedClients.add(ws);

    ws.send(JSON.stringify({
        type: 'status',
        data: { connected: true }
    }));

    ws.on('message', (message) => {
        try {
            const command = JSON.parse(message);
            handleCommand(command);
        } catch (err) {
            console.error(`命令解析失败: ${err.message}`);
        }
    });

    ws.on('close', () => {
        console.log('客户端已断开');
        connectedClients.delete(ws);
    });
});

function isOutdoorMode() {
    if (!currentNavData) {
        console.log('警告: 未收到Navdata，假设为露天模式');
        return true;
    }
    return currentNavData.outdoorMode === true;
}

function canAcceptCommand(action) {
    if (!isOutdoorMode()) {
        console.log(`命令 ${action} 被拒绝：非露天模式`);
        return false;
    }

    if (currentNavData && currentNavData.batteryTooLow) {
        console.log(`命令 ${action} 被拒绝：电池电量过低`);
        return false;
    }

    if (currentNavData && currentNavData.angleEmergency) {
        console.log(`命令 ${action} 被拒绝：角度紧急状态`);
        return false;
    }

    if (currentNavData && currentNavData.comLost) {
        console.log(`命令 ${action} 被拒绝：通信丢失`);
        return false;
    }

    return true;
}

function handleCommand(cmd) {
    if (!canAcceptCommand(cmd.action)) {
        sendCommandReject(cmd.action, '前置条件不满足');
        return;
    }

    switch (cmd.action) {
        case 'takeoff':
            sendAtCommand(`AT*REF=${sequence},290718208`);
            sequence++;
            break;
        case 'land':
            sendAtCommand(`AT*REF=${sequence},290717696`);
            sequence++;
            break;
        case 'emergency':
            sendAtCommand(`AT*REF=${sequence},290717952`);
            sequence++;
            break;
        case 'move':
            const roll = cmd.roll || 0;
            const pitch = cmd.pitch || 0;
            const gaz = cmd.gaz || 0;
            const yaw = cmd.yaw || 0;
            sendAtCommand(`AT*PCMD=${sequence},1,${formatFloat(roll)},${formatFloat(pitch)},${formatFloat(gaz)},${formatFloat(yaw)}`);
            sequence++;
            break;
        case 'hover':
            sendAtCommand(`AT*PCMD=${sequence},0,0,0,0,0`);
            sequence++;
            break;
        case 'config':
            if (cmd.key && cmd.value) {
                sendAtCommand(`AT*CONFIG=${sequence},"${cmd.key}","${cmd.value}"`);
                sequence++;
            }
            break;
        case 'configIds':
            sendAtCommand(`AT*CONFIG_IDS=${sequence},"${cmd.sessionId || '0'}","${cmd.userId || '0'}","${cmd.appId || '0'}"`);
            sequence++;
            break;
        case 'calibrate':
            sendAtCommand(`AT*FTRIM=${sequence}`);
            sequence++;
            break;
        case 'animate':
            if (cmd.animation !== undefined && cmd.duration) {
                sendAtCommand(`AT*ANIM=${sequence},${cmd.animation},${cmd.duration}`);
                sequence++;
            }
            break;
        case 'led':
            if (cmd.animation !== undefined && cmd.frequency && cmd.duration) {
                sendAtCommand(`AT*LED=${sequence},${cmd.animation},${formatFloat(cmd.frequency)},${cmd.duration}`);
                sequence++;
            }
            break;
        case 'videoChannel':
            sendAtCommand(`AT*CONFIG=${sequence},"video:video_channel","${cmd.channel || 0}"`);
            sequence++;
            break;
        case 'raw':
            if (cmd.command) {
                sendAtCommand(cmd.command);
                sequence++;
            }
            break;
        default:
            console.log(`未知命令: ${cmd.action}`);
    }
}

function sendCommandReject(action, reason) {
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'command_rejected',
                data: { action, reason }
            }));
        }
    });
}

function initDroneConnection() {
    return new Promise((resolve, reject) => {
        videoSocket.bind(VIDEO_PORT, () => {
            console.log(`视频流接收端口: ${VIDEO_PORT}`);
        });

        navSocket.bind(NAV_PORT, () => {
            console.log(`导航数据接收端口: ${NAV_PORT}`);
        });

        const heartbeatInterval = setInterval(() => {
            sendAtCommand(`AT*COMWDG=${sequence}`);
            sequence++;
        }, 100);

        setTimeout(() => {
            sendAtCommand(`AT*CONFIG=${sequence},"general:navdata_demo","FALSE"`);
            sequence++;
            sendAtCommand(`AT*CONFIG=${sequence},"general:video_enable","TRUE"`);
            sequence++;
            sendAtCommand(`AT*CTRL=${sequence},5,0`);
            sequence++;

            console.log('无人机初始化完成');
            resolve();
        }, 1000);
    });
}

server.listen(SERVER_PORT, () => {
    console.log(`服务器运行在 http://localhost:${SERVER_PORT}`);
    initDroneConnection();
});

process.on('SIGINT', () => {
    console.log('关闭服务器...');
    atSocket.close();
    videoSocket.close();
    navSocket.close();
    server.close();
    process.exit(0);
});
