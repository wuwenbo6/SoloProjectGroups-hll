const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const L2CAP_PSM = 0x0001;
const CID_SIGNALING = 0x0001;
const CID_CONNECTIONLESS = 0x0002;

const SIGNALING_CODES = {
  CONNECTION_REQ: 0x02,
  CONNECTION_RSP: 0x03,
  CONFIGURATION_REQ: 0x04,
  CONFIGURATION_RSP: 0x05,
  DISCONNECTION_REQ: 0x06,
  DISCONNECTION_RSP: 0x07,
  FLOW_CONTROL_CREDIT: 0x16
};

const CONNECTION_RESULTS = {
  SUCCESSFUL: 0x0000,
  PEND: 0x0001,
  REF_BAD_PSM: 0x0002,
  REF_SEC: 0x0003,
  REF_RESOURCES: 0x0004
};

const CONFIG_RESULTS = {
  SUCCESS: 0x0000,
  UNACCEPTABLE: 0x0001,
  REJECTED: 0x0002,
  UNKNOWN_OPTIONS: 0x0003
};

const STATES = {
  DISCONNECTED: 'disconnected',
  WAIT_CONNECT_RSP: 'wait_connect_rsp',
  WAIT_CONFIG_REQ: 'wait_config_req',
  WAIT_CONFIG_RSP: 'wait_config_rsp',
  CONNECTED: 'connected',
  WAIT_DISCONNECT_RSP: 'wait_disconnect_rsp'
};

let state = {
  status: STATES.DISCONNECTED,
  channelId: null,
  psm: L2CAP_PSM,
  mtu: null,
  localMtu: 672,
  remoteMtu: 480,
  flushTimeout: 65535,
  peerAddress: null,
  bytesSent: 0,
  bytesReceived: 0,
  identifier: 1,
  signalingHistory: [],
  localCredits: 0,
  remoteCredits: 0,
  initialCredits: 7
};

let simTimer = null;
let logStore = [];

function nextId() {
  state.identifier = (state.identifier % 255) + 1;
  return state.identifier;
}

function updateState(changes) {
  state = { ...state, ...changes };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('l2cap:stateUpdate', state);
  }
}

function emitLog(type, message, data = null) {
  const entry = { type, message, data, timestamp: Date.now() };
  logStore.push(entry);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('l2cap:log', entry);
  }
}

function emitSignaling(pkt) {
  state.signalingHistory = [...state.signalingHistory, pkt];
  updateState({ signalingHistory: state.signalingHistory });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('l2cap:signaling', pkt);
  }
}

function buildFrame(cid, payload) {
  const len = payload.length;
  const header = Buffer.alloc(4);
  header.writeUInt16LE(len, 0);
  header.writeUInt16LE(cid, 2);
  return Buffer.concat([header, payload]);
}

function buildSignalingCommand(code, id, data) {
  const len = data.length;
  const hdr = Buffer.alloc(4);
  hdr.writeUInt8(code, 0);
  hdr.writeUInt8(id, 1);
  hdr.writeUInt16LE(len, 2);
  return Buffer.concat([hdr, data]);
}

function buildConnectionReq(id, psm, scid) {
  const d = Buffer.alloc(4);
  d.writeUInt16LE(psm, 0);
  d.writeUInt16LE(scid, 2);
  return buildSignalingCommand(SIGNALING_CODES.CONNECTION_REQ, id, d);
}

function buildConnectionRsp(id, dcid, scid, result, status) {
  const d = Buffer.alloc(8);
  d.writeUInt16LE(dcid, 0);
  d.writeUInt16LE(scid, 2);
  d.writeUInt16LE(result, 4);
  d.writeUInt16LE(status, 6);
  return buildSignalingCommand(SIGNALING_CODES.CONNECTION_RSP, id, d);
}

function buildConfigReq(id, dcid, flags, mtu, flushTo) {
  const mtuOpt = Buffer.alloc(4);
  mtuOpt.writeUInt8(0x01, 0);
  mtuOpt.writeUInt8(0x02, 1);
  mtuOpt.writeUInt16LE(mtu, 2);

  const flushOpt = Buffer.alloc(6);
  flushOpt.writeUInt8(0x02, 0);
  flushOpt.writeUInt8(0x02, 1);
  flushOpt.writeUInt16LE(flushTo, 2);

  const d = Buffer.alloc(4 + mtuOpt.length + flushOpt.length);
  d.writeUInt16LE(dcid, 0);
  d.writeUInt16LE(flags, 2);
  mtuOpt.copy(d, 4);
  flushOpt.copy(d, 4 + mtuOpt.length);

  return buildSignalingCommand(SIGNALING_CODES.CONFIGURATION_REQ, id, d);
}

function buildConfigRsp(id, scid, flags, result, mtu, flushTo) {
  const mtuOpt = Buffer.alloc(4);
  mtuOpt.writeUInt8(0x01, 0);
  mtuOpt.writeUInt8(0x02, 1);
  mtuOpt.writeUInt16LE(mtu, 2);

  const flushOpt = Buffer.alloc(6);
  flushOpt.writeUInt8(0x02, 0);
  flushOpt.writeUInt8(0x02, 1);
  flushOpt.writeUInt16LE(flushTo, 2);

  const d = Buffer.alloc(4 + mtuOpt.length + flushOpt.length);
  d.writeUInt16LE(scid, 0);
  d.writeUInt16LE(flags, 2);
  d.writeUInt16LE(result, 4);
  mtuOpt.copy(d, 6);
  flushOpt.copy(d, 6 + mtuOpt.length);

  return buildSignalingCommand(SIGNALING_CODES.CONFIGURATION_RSP, id, d);
}

function buildDisconnectionReq(id, dcid, scid) {
  const d = Buffer.alloc(4);
  d.writeUInt16LE(dcid, 0);
  d.writeUInt16LE(scid, 2);
  return buildSignalingCommand(SIGNALING_CODES.DISCONNECTION_REQ, id, d);
}

function buildDisconnectionRsp(id, dcid, scid) {
  const d = Buffer.alloc(4);
  d.writeUInt16LE(dcid, 0);
  d.writeUInt16LE(scid, 2);
  return buildSignalingCommand(SIGNALING_CODES.DISCONNECTION_RSP, id, d);
}

function buildFlowControlCredit(id, cid, credits) {
  const d = Buffer.alloc(4);
  d.writeUInt16LE(cid, 0);
  d.writeUInt16LE(credits, 2);
  return buildSignalingCommand(SIGNALING_CODES.FLOW_CONTROL_CREDIT, id, d);
}

function signalingName(code) {
  const map = {
    [SIGNALING_CODES.CONNECTION_REQ]: 'CONNECTION_REQ',
    [SIGNALING_CODES.CONNECTION_RSP]: 'CONNECTION_RSP',
    [SIGNALING_CODES.CONFIGURATION_REQ]: 'CONFIGURATION_REQ',
    [SIGNALING_CODES.CONFIGURATION_RSP]: 'CONFIGURATION_RSP',
    [SIGNALING_CODES.DISCONNECTION_REQ]: 'DISCONNECTION_REQ',
    [SIGNALING_CODES.DISCONNECTION_RSP]: 'DISCONNECTION_RSP',
    [SIGNALING_CODES.FLOW_CONTROL_CREDIT]: 'FLOW_CONTROL_CREDIT'
  };
  return map[code] || 'UNKNOWN';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'L2CAP Connection-Oriented Channel Demo',
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    clearSimTimer();
  });
}

function clearSimTimer() {
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('l2cap:getState', async () => state);

ipcMain.handle('l2cap:connect', async (event, peerAddress) => {
  if (state.status !== STATES.DISCONNECTED) {
    return { success: false, error: 'Already connected or in progress' };
  }

  const addr = peerAddress || 'AA:BB:CC:DD:EE:FF';
  updateState({
    status: STATES.WAIT_CONNECT_RSP,
    peerAddress: addr,
    bytesSent: 0,
    bytesReceived: 0,
    signalingHistory: []
  });

  const localCid = 0x0040 + Math.floor(Math.random() * 0x003F);

  emitLog('info', `[TX] L2CAP CONNECTION_REQ → Signaling Channel (CID 0x0001)`, {
    psm: `0x${L2CAP_PSM.toString(16).padStart(4, '0')}`,
    scid: `0x${localCid.toString(16).padStart(4, '0')}`,
    identifier: state.identifier
  });

  const reqFrame = buildFrame(CID_SIGNALING, buildConnectionReq(nextId(), L2CAP_PSM, localCid));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.CONNECTION_REQ,
    name: signalingName(SIGNALING_CODES.CONNECTION_REQ),
    id: state.identifier,
    raw: reqFrame.toString('hex'),
    fields: { psm: L2CAP_PSM, scid: localCid },
    timestamp: Date.now()
  });

  await delay(800);

  const remoteCid = 0x0080 + Math.floor(Math.random() * 0x003F);

  emitLog('success', `[RX] L2CAP CONNECTION_RSP ← Peer`, {
    dcid: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    scid: `0x${localCid.toString(16).padStart(4, '0')}`,
    result: 'SUCCESSFUL (0x0000)',
    status: 'No further information (0x0000)'
  });

  const rspFrame = buildFrame(CID_SIGNALING, buildConnectionRsp(state.identifier, remoteCid, localCid, CONNECTION_RESULTS.SUCCESSFUL, 0x0000));
  emitSignaling({
    direction: 'rx',
    code: SIGNALING_CODES.CONNECTION_RSP,
    name: signalingName(SIGNALING_CODES.CONNECTION_RSP),
    id: state.identifier,
    raw: rspFrame.toString('hex'),
    fields: { dcid: remoteCid, scid: localCid, result: CONNECTION_RESULTS.SUCCESSFUL, status: 0x0000 },
    timestamp: Date.now()
  });

  updateState({
    channelId: localCid,
    remoteCid: remoteCid
  });

  await delay(400);
  updateState({ status: STATES.WAIT_CONFIG_REQ });

  emitLog('info', `[TX] L2CAP CONFIGURATION_REQ → CID 0x0001 (outgoing config)`, {
    dcid: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    flags: '0x0000',
    mtuOption: { type: 'MTU', value: state.localMtu },
    flushOption: { type: 'Flush Timeout', value: state.flushTimeout },
    identifier: state.identifier
  });

  const cfgReqFrame = buildFrame(CID_SIGNALING, buildConfigReq(nextId(), remoteCid, 0x0000, state.localMtu, state.flushTimeout));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.CONFIGURATION_REQ,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_REQ),
    id: state.identifier,
    raw: cfgReqFrame.toString('hex'),
    fields: { dcid: remoteCid, flags: 0x0000, mtu: state.localMtu, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  await delay(1000);

  const negotiatedMtu = Math.min(state.localMtu, state.remoteMtu);

  emitLog('info', `MTU 协商: 本地提议 ${state.localMtu}, 对端提议 ${state.remoteMtu}`, {
    localMTU: state.localMtu,
    peerMTU: state.remoteMtu,
    rule: '取双方较小值',
    result: negotiatedMtu
  });

  emitLog('success', `[RX] L2CAP CONFIGURATION_RSP ← Peer (accepts our config)`, {
    scid: `0x${localCid.toString(16).padStart(4, '0')}`,
    flags: '0x0000',
    result: 'SUCCESS (0x0000)',
    mtuOption: { type: 'MTU', value: negotiatedMtu },
    flushOption: { type: 'Flush Timeout', value: state.flushTimeout }
  });

  const cfgRspFrame = buildFrame(CID_SIGNALING, buildConfigRsp(state.identifier, localCid, 0x0000, CONFIG_RESULTS.SUCCESS, negotiatedMtu, state.flushTimeout));
  emitSignaling({
    direction: 'rx',
    code: SIGNALING_CODES.CONFIGURATION_RSP,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_RSP),
    id: state.identifier,
    raw: cfgRspFrame.toString('hex'),
    fields: { scid: localCid, flags: 0x0000, result: CONFIG_RESULTS.SUCCESS, mtu: negotiatedMtu, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  await delay(400);
  updateState({ status: STATES.WAIT_CONFIG_RSP });

  emitLog('info', `[RX] L2CAP CONFIGURATION_REQ ← Peer (incoming config)`, {
    dcid: `0x${localCid.toString(16).padStart(4, '0')}`,
    mtuOption: { type: 'MTU', value: state.remoteMtu },
    identifier: state.identifier + 1
  });

  const peerCfgReqId = nextId();
  const peerCfgReqFrame = buildFrame(CID_SIGNALING, buildConfigReq(peerCfgReqId, localCid, 0x0000, state.remoteMtu, state.flushTimeout));
  emitSignaling({
    direction: 'rx',
    code: SIGNALING_CODES.CONFIGURATION_REQ,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_REQ),
    id: peerCfgReqId,
    raw: peerCfgReqFrame.toString('hex'),
    fields: { dcid: localCid, flags: 0x0000, mtu: state.remoteMtu, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  await delay(800);

  emitLog('success', `[TX] L2CAP CONFIGURATION_RSP → CID 0x0001 (accept peer config)`, {
    scid: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    result: 'SUCCESS (0x0000)',
    mtuOption: { type: 'MTU', value: negotiatedMtu }
  });

  const ourCfgRspFrame = buildFrame(CID_SIGNALING, buildConfigRsp(nextId(), remoteCid, 0x0000, CONFIG_RESULTS.SUCCESS, negotiatedMtu, state.flushTimeout));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.CONFIGURATION_RSP,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_RSP),
    id: state.identifier,
    raw: ourCfgRspFrame.toString('hex'),
    fields: { scid: remoteCid, flags: 0x0000, result: CONFIG_RESULTS.SUCCESS, mtu: negotiatedMtu, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  updateState({
    status: STATES.CONNECTED,
    channelId: localCid,
    mtu: negotiatedMtu,
    localCredits: state.initialCredits,
    remoteCredits: state.initialCredits
  });

  emitLog('success', `✓ L2CAP 面向连接通道已建立`, {
    localCID: `0x${localCid.toString(16).padStart(4, '0')}`,
    remoteCID: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    psm: `0x${L2CAP_PSM.toString(16).padStart(4, '0')}`,
    negotiatedMTU: negotiatedMtu,
    flushTimeout: state.flushTimeout,
    flowControl: '信用流控模式',
    initialCredits: state.initialCredits
  });

  emitLog('info', `信用流控已启用: 本地信用=${state.initialCredits}, 对端信用=${state.initialCredits}`, {
    note: '发送数据消耗本地信用，对端授予信用恢复；接收数据消耗对端信用，本地授予恢复'
  });

  startSimHeartbeat();

  return { success: true, channelId: localCid, mtu: negotiatedMtu };
});

function startSimHeartbeat() {
  clearSimTimer();
  simTimer = setInterval(() => {
    if (state.status === STATES.CONNECTED) {
      const msg = `ACK:${Date.now()}`;
      const payload = Buffer.from(msg, 'utf8');

      if (state.remoteCredits <= 0) {
        emitLog('warning', `对端信用不足，暂停接收 (等待本地授予信用)`, {
          remoteCredits: state.remoteCredits
        });
        return;
      }

      updateState({
        bytesReceived: state.bytesReceived + payload.length,
        remoteCredits: state.remoteCredits - 1
      });

      emitLog('receive', `[RX] Data ← CID 0x${state.channelId.toString(16).padStart(4, '0')} (对端信用 -1, 剩余 ${state.remoteCredits})`, {
        length: payload.length,
        hex: payload.toString('hex'),
        ascii: msg
      });

      setTimeout(() => {
        if (state.status === STATES.CONNECTED) {
          const grantCount = Math.min(3, state.initialCredits - state.remoteCredits);
          if (grantCount > 0) {
            updateState({ remoteCredits: state.remoteCredits + grantCount });

            const creditFrame = buildFrame(CID_SIGNALING, buildFlowControlCredit(nextId(), state.channelId, grantCount));
            emitSignaling({
              direction: 'tx',
              code: SIGNALING_CODES.FLOW_CONTROL_CREDIT,
              name: signalingName(SIGNALING_CODES.FLOW_CONTROL_CREDIT),
              id: state.identifier,
              raw: creditFrame.toString('hex'),
              fields: { cid: state.channelId, credits: grantCount },
              timestamp: Date.now()
            });

            emitLog('info', `[TX] FLOW_CONTROL_CREDIT → 授予对端 ${grantCount} 信用`, {
              cid: fmtCid(state.channelId),
              granted: grantCount,
              remoteCreditsAfter: state.remoteCredits
            });
          }
        }
      }, 500);
    }
  }, 4000);
}

ipcMain.handle('l2cap:disconnect', async () => {
  if (state.status !== STATES.CONNECTED) {
    return { success: false, error: 'Not connected' };
  }

  clearSimTimer();
  updateState({ status: STATES.WAIT_DISCONNECT_RSP });

  const localCid = state.channelId;
  const remoteCid = state.remoteCid;

  emitLog('info', `[TX] L2CAP DISCONNECTION_REQ → CID 0x0001`, {
    dcid: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    scid: `0x${localCid.toString(16).padStart(4, '0')}`
  });

  const disconReqFrame = buildFrame(CID_SIGNALING, buildDisconnectionReq(nextId(), remoteCid, localCid));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.DISCONNECTION_REQ,
    name: signalingName(SIGNALING_CODES.DISCONNECTION_REQ),
    id: state.identifier,
    raw: disconReqFrame.toString('hex'),
    fields: { dcid: remoteCid, scid: localCid },
    timestamp: Date.now()
  });

  await delay(500);

  emitLog('success', `[RX] L2CAP DISCONNECTION_RSP ← Peer`, {
    dcid: `0x${localCid.toString(16).padStart(4, '0')}`,
    scid: `0x${remoteCid.toString(16).padStart(4, '0')}`
  });

  const disconRspFrame = buildFrame(CID_SIGNALING, buildDisconnectionRsp(state.identifier, localCid, remoteCid));
  emitSignaling({
    direction: 'rx',
    code: SIGNALING_CODES.DISCONNECTION_RSP,
    name: signalingName(SIGNALING_CODES.DISCONNECTION_RSP),
    id: state.identifier,
    raw: disconRspFrame.toString('hex'),
    fields: { dcid: localCid, scid: remoteCid },
    timestamp: Date.now()
  });

  emitLog('success', `✓ CID 已释放`, {
    releasedLocalCID: `0x${localCid.toString(16).padStart(4, '0')}`,
    releasedRemoteCID: `0x${remoteCid.toString(16).padStart(4, '0')}`,
    note: '通道标识符已归还可用池'
  });

  updateState({
    status: STATES.DISCONNECTED,
    channelId: null,
    mtu: null,
    remoteCid: null,
    bytesSent: 0,
    bytesReceived: 0,
    peerAddress: null,
    localCredits: 0,
    remoteCredits: 0
  });

  emitLog('info', 'L2CAP 通道已关闭，所有资源已释放');

  return { success: true };
});

ipcMain.handle('l2cap:sendData', async (event, dataString) => {
  if (state.status !== STATES.CONNECTED) {
    return { success: false, error: 'Not connected' };
  }

  if (state.localCredits <= 0) {
    emitLog('error', `本地信用不足，无法发送 (等待对端授予信用)`, {
      localCredits: state.localCredits,
      hint: '点击"授予对端信用"或等待对端自动授予'
    });
    return { success: false, error: 'No credits available', creditsNeeded: 1 };
  }

  const payload = Buffer.from(dataString, 'utf8');
  const framesNeeded = Math.ceil(payload.length / state.mtu);

  if (framesNeeded > state.localCredits) {
    emitLog('warning', `数据需要 ${framesNeeded} 帧但仅有 ${state.localCredits} 信用，将发送前 ${state.localCredits} 帧`, {
      totalFrames: framesNeeded,
      availableCredits: state.localCredits
    });
  }

  const actualFrames = Math.min(framesNeeded, state.localCredits);

  if (payload.length > state.mtu) {
    const fragments = [];
    let offset = 0;
    while (offset < payload.length && fragments.length < actualFrames) {
      fragments.push(payload.slice(offset, offset + state.mtu));
      offset += state.mtu;
    }

    emitLog('warning', `数据 ${payload.length} 字节超过 MTU ${state.mtu}，分片为 ${fragments.length} 帧 (信用限制)`, {
      totalLength: payload.length,
      mtu: state.mtu,
      fragments: fragments.length,
      creditsUsed: fragments.length,
      creditsRemaining: state.localCredits - fragments.length
    });

    for (let i = 0; i < fragments.length; i++) {
      const frame = buildFrame(state.channelId, fragments[i]);
      emitLog('send', `[TX] Data → CID 0x${state.channelId.toString(16).padStart(4, '0')} (fragment ${i + 1}/${fragments.length}) [信用 -1]`, {
        length: fragments[i].length,
        hex: fragments[i].toString('hex'),
        ascii: fragments[i].toString('ascii')
      });
      updateState({ bytesSent: state.bytesSent + fragments[i].length, localCredits: state.localCredits - 1 });
      await delay(100);
    }
  } else {
    const frame = buildFrame(state.channelId, payload);
    emitLog('send', `[TX] Data → CID 0x${state.channelId.toString(16).padStart(4, '0')} [信用 -1, 剩余 ${state.localCredits - 1}]`, {
      length: payload.length,
      hex: payload.toString('hex'),
      ascii: dataString,
      frameHeader: frame.slice(0, 4).toString('hex')
    });
    updateState({ bytesSent: state.bytesSent + payload.length, localCredits: state.localCredits - 1 });
  }

  setTimeout(async () => {
    if (state.status === STATES.CONNECTED) {
      const grantFromPeer = Math.min(2, state.initialCredits - state.localCredits);
      if (grantFromPeer > 0) {
        updateState({ localCredits: state.localCredits + grantFromPeer });

        const peerCreditFrame = buildFrame(CID_SIGNALING, buildFlowControlCredit(nextId(), state.remoteCid, grantFromPeer));
        emitSignaling({
          direction: 'rx',
          code: SIGNALING_CODES.FLOW_CONTROL_CREDIT,
          name: signalingName(SIGNALING_CODES.FLOW_CONTROL_CREDIT),
          id: state.identifier,
          raw: peerCreditFrame.toString('hex'),
          fields: { cid: state.remoteCid, credits: grantFromPeer },
          timestamp: Date.now()
        });

        emitLog('info', `[RX] FLOW_CONTROL_CREDIT ← 对端授予 ${grantFromPeer} 信用`, {
          localCreditsAfter: state.localCredits
        });
      }
    }
  }, 800);

  return { success: true, bytesSent: payload.length, creditsRemaining: state.localCredits };
});

ipcMain.handle('l2cap:negotiateMtu', async (event, requestedMtu) => {
  if (state.status !== STATES.CONNECTED) {
    return { success: false, error: 'Not connected' };
  }

  const effectiveReq = Math.min(requestedMtu, state.localMtu);
  if (effectiveReq < requestedMtu) {
    emitLog('warning', `请求 MTU ${requestedMtu} 超过本地限制 ${state.localMtu}，实际请求值调整为 ${effectiveReq}`);
  }

  emitLog('info', `[TX] L2CAP CONFIGURATION_REQ → MTU renegotiation`, {
    dcid: `0x${state.remoteCid.toString(16).padStart(4, '0')}`,
    requestedMTU: effectiveReq,
    localMax: state.localMtu,
    peerMax: state.remoteMtu
  });

  const cfgFrame = buildFrame(CID_SIGNALING, buildConfigReq(nextId(), state.remoteCid, 0x0000, effectiveReq, state.flushTimeout));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.CONFIGURATION_REQ,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_REQ),
    id: state.identifier,
    raw: cfgFrame.toString('hex'),
    fields: { dcid: state.remoteCid, flags: 0x0000, mtu: effectiveReq, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  await delay(1000);

  const negotiated = Math.min(effectiveReq, state.remoteMtu);

  if (negotiated < requestedMtu) {
    emitLog('warning', `MTU 协商受限于较小值: 本地=${state.localMtu}, 对端=${state.remoteMtu}`, {
      requested: requestedMtu,
      localMax: state.localMtu,
      peerMax: state.remoteMtu,
      negotiated: negotiated
    });
  }

  emitLog('success', `[RX] L2CAP CONFIGURATION_RSP ← MTU 协商完成`, {
    result: negotiated < effectiveReq ? 'UNACCEPTABLE (部分接受)' : 'SUCCESS',
    negotiatedMTU: negotiated,
    note: '取本地与对端较小值'
  });

  const rspFrame = buildFrame(CID_SIGNALING, buildConfigRsp(state.identifier, state.channelId, 0x0000, negotiated < effectiveReq ? CONFIG_RESULTS.UNACCEPTABLE : CONFIG_RESULTS.SUCCESS, negotiated, state.flushTimeout));
  emitSignaling({
    direction: 'rx',
    code: SIGNALING_CODES.CONFIGURATION_RSP,
    name: signalingName(SIGNALING_CODES.CONFIGURATION_RSP),
    id: state.identifier,
    raw: rspFrame.toString('hex'),
    fields: { scid: state.channelId, flags: 0x0000, result: negotiated < effectiveReq ? CONFIG_RESULTS.UNACCEPTABLE : CONFIG_RESULTS.SUCCESS, mtu: negotiated, flushTimeout: state.flushTimeout },
    timestamp: Date.now()
  });

  updateState({ mtu: negotiated });

  return { success: true, mtu: negotiated };
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fmtCid(v) {
  return v != null ? '0x' + v.toString(16).padStart(4, '0') : '-';
}

ipcMain.handle('l2cap:grantCredits', async (event, count) => {
  if (state.status !== STATES.CONNECTED) {
    return { success: false, error: 'Not connected' };
  }

  const grantCount = Math.max(1, Math.min(count || 3, 65535));

  const creditFrame = buildFrame(CID_SIGNALING, buildFlowControlCredit(nextId(), state.channelId, grantCount));
  emitSignaling({
    direction: 'tx',
    code: SIGNALING_CODES.FLOW_CONTROL_CREDIT,
    name: signalingName(SIGNALING_CODES.FLOW_CONTROL_CREDIT),
    id: state.identifier,
    raw: creditFrame.toString('hex'),
    fields: { cid: state.channelId, credits: grantCount },
    timestamp: Date.now()
  });

  updateState({ remoteCredits: state.remoteCredits + grantCount });

  emitLog('info', `[TX] FLOW_CONTROL_CREDIT → 授予对端 ${grantCount} 信用`, {
    cid: fmtCid(state.channelId),
    granted: grantCount,
    remoteCreditsAfter: state.remoteCredits,
    note: '对端收到信用后可继续发送数据'
  });

  return { success: true, remoteCredits: state.remoteCredits };
});

ipcMain.handle('l2cap:exportLogs', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'No window' };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出通信日志',
    defaultPath: `l2cap-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Text', extensions: ['txt'] }
    ]
  });

  if (result.canceled) {
    return { success: false, error: 'Cancelled' };
  }

  const filePath = result.filePath;
  if (!filePath) {
    return { success: false, error: 'No path' };
  }

  try {
    const exportData = {
      exportTime: new Date().toISOString(),
      connectionState: { ...state, signalingHistory: undefined },
      signalingHistory: state.signalingHistory,
      logs: logStore.map(l => ({
        time: new Date(l.timestamp).toISOString(),
        type: l.type,
        message: l.message,
        data: l.data
      }))
    };

    if (filePath.endsWith('.txt')) {
      const lines = [
        `L2CAP Communication Log Export`,
        `Export Time: ${exportData.exportTime}`,
        ``,
        `=== Connection State ===`,
        `Status: ${state.status}`,
        `Local CID: ${fmtCid(state.channelId)}`,
        `MTU: ${state.mtu || '-'}`,
        `PSM: 0x${state.psm.toString(16).padStart(4, '0')}`,
        `Peer: ${state.peerAddress || '-'}`,
        `Local Credits: ${state.localCredits}`,
        `Remote Credits: ${state.remoteCredits}`,
        `Bytes Sent: ${state.bytesSent}`,
        `Bytes Received: ${state.bytesReceived}`,
        ``,
        `=== Signaling History ===`
      ];
      for (const pkt of state.signalingHistory) {
        lines.push(`[${pkt.direction.toUpperCase()}] ${pkt.name} (id=${pkt.id}) ${JSON.stringify(pkt.fields)}`);
      }
      lines.push('');
      lines.push('=== Communication Log ===');
      for (const l of logStore) {
        lines.push(`[${new Date(l.timestamp).toISOString()}] [${l.type.toUpperCase()}] ${l.message}${l.data ? ' | ' + JSON.stringify(l.data) : ''}`);
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8');
    }

    emitLog('success', `日志已导出: ${filePath}`, { path: filePath });
    return { success: true, path: filePath };
  } catch (err) {
    emitLog('error', `导出失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});