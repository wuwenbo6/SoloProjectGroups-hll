const CEC_OPCODES = {
  0x04: { name: 'Image View On', description: '显示设备从待机唤醒', category: 'power' },
  0x36: { name: 'Standby', description: '设备进入待机模式', category: 'power' },
  0x0D: { name: 'Text View On', description: '文字显示开启', category: 'power' },
  0x6B: { name: 'Play', description: '一键播放', category: 'playback' },
  0x41: { name: 'User Control Pressed', description: '用户控制按下', category: 'remote' },
  0x42: { name: 'User Control Released', description: '用户控制释放', category: 'remote' },
  0x8B: { name: 'Report Power Status', description: '报告电源状态', category: 'status' },
  0x8F: { name: 'Get CEC Version', description: '获取CEC版本', category: 'info' },
  0x9E: { name: 'CEC Version', description: 'CEC版本信息', category: 'info' },
  0x83: { name: 'Give Physical Address', description: '请求物理地址', category: 'info' },
  0x84: { name: 'Report Physical Address', description: '报告物理地址', category: 'info' },
  0x87: { name: 'Give Device Power Status', description: '请求设备电源状态', category: 'status' },
  0x71: { name: 'Give Audio Status', description: '请求音频状态', category: 'audio' },
  0x7A: { name: 'Give System Audio Mode Status', description: '请求系统音频模式状态', category: 'audio' },
  0x72: { name: 'Set System Audio Mode', description: '设置系统音频模式', category: 'audio' },
  0x7E: { name: 'System Audio Mode Request', description: '系统音频模式请求', category: 'audio' },
  0x70: { name: 'Report Audio Status', description: '报告音频状态', category: 'audio' },
  0x6C: { name: 'Deck Control', description: '播放控制', category: 'playback' },
  0x1B: { name: 'Deck Status', description: '播放状态', category: 'playback' },
  0x44: { name: 'Vendor Command', description: '厂商命令', category: 'vendor' },
  0x8C: { name: 'Vendor Command With ID', description: '带ID的厂商命令', category: 'vendor' },
  0x00: { name: 'Feature Abort', description: '功能中止', category: 'error' },
  0xFF: { name: 'Abort', description: '中止命令', category: 'error' },
  0x4E: { name: 'Menu Request', description: '菜单请求', category: 'menu' },
  0x4D: { name: 'Menu Status', description: '菜单状态', category: 'menu' },
  0x86: { name: 'Set Menu Language', description: '设置菜单语言', category: 'menu' },
  0x82: { name: 'Active Source', description: '激活源', category: 'routing' },
  0x85: { name: 'Request Active Source', description: '请求激活源', category: 'routing' },
  0x80: { name: 'Routing Change', description: '路由改变', category: 'routing' },
  0x81: { name: 'Routing Information', description: '路由信息', category: 'routing' },
  0x90: { name: 'Report Address', description: '报告地址', category: 'info' },
  0x91: { name: 'Give Device Vendor ID', description: '请求设备厂商ID', category: 'info' },
  0x89: { name: 'Set OSD String', description: '设置OSD字符串', category: 'osd' },
  0x64: { name: 'Set OSD Name', description: '设置OSD名称', category: 'osd' },
  0x46: { name: 'Set Audio Rate', description: '设置音频速率', category: 'audio' },
  0x9F: { name: 'Get Menu Language', description: '获取菜单语言', category: 'menu' },
  0xA0: { name: 'Set Timer Program Title', description: '设置定时器程序标题', category: 'timer' },
  0xA1: { name: 'Set Timer Programmed Info', description: '设置定时器信息', category: 'timer' },
  0xA2: { name: 'Clear Analogue Timer', description: '清除模拟定时器', category: 'timer' },
  0xA3: { name: 'Set Analogue Timer', description: '设置模拟定时器', category: 'timer' },
  0xA4: { name: 'Timer Status', description: '定时器状态', category: 'timer' },
  0xA5: { name: 'Standby Wake', description: '待机唤醒', category: 'power' },
  0x0B: { name: 'Record Off', description: '停止录制', category: 'recording' },
  0x09: { name: 'Record On', description: '开始录制', category: 'recording' },
  0x0A: { name: 'Record Status', description: '录制状态', category: 'recording' },
  0x0F: { name: 'Record TV Screen', description: '录制电视屏幕', category: 'recording' },
  0x10: { name: 'Clear External Timer', description: '清除外部定时器', category: 'timer' },
  0x11: { name: 'Set External Timer', description: '设置外部定时器', category: 'timer' },
  0x12: { name: 'External Timer Status', description: '外部定时器状态', category: 'timer' }
};

const CEC_DEVICES = {
  0x0: 'TV',
  0x1: 'Recording 1',
  0x2: 'Recording 2',
  0x3: 'Tuner 1',
  0x4: 'Playback 1',
  0x5: 'Audio System',
  0x6: 'Tuner 2',
  0x7: 'Tuner 3',
  0x8: 'Playback 2',
  0x9: 'Playback 3',
  0xA: 'Tuner 4',
  0xB: 'Playback 3',
  0xC: 'Reserved',
  0xD: 'Reserved',
  0xE: 'Free Use',
  0xF: 'Broadcast / Unregistered'
};

const USER_CONTROL_CODES = {
  0x00: 'Select',
  0x01: 'Up',
  0x02: 'Down',
  0x03: 'Left',
  0x04: 'Right',
  0x05: 'Right-Up',
  0x06: 'Right-Down',
  0x07: 'Left-Up',
  0x08: 'Left-Down',
  0x09: 'Device Root Menu',
  0x0A: 'Device Setup Menu',
  0x0B: 'Contents Menu',
  0x0C: 'Favorite Menu',
  0x0D: 'Exit',
  0x20: 'Volume Up',
  0x21: 'Volume Down',
  0x22: 'Mute',
  0x23: 'Play',
  0x24: 'Stop',
  0x25: 'Pause',
  0x26: 'Record',
  0x27: 'Rewind',
  0x28: 'Fast forward',
  0x29: 'Eject',
  0x2A: 'Forward',
  0x2B: 'Backward',
  0x2C: 'Stop Record',
  0x2D: 'Pause Record',
  0x30: 'Power',
  0x31: 'Volume Up',
  0x32: 'Volume Down',
  0x33: 'Mute',
  0x35: 'Input Select',
  0x36: 'Input Change',
  0x40: 'Display Information',
  0x41: 'Help',
  0x42: 'Page Up',
  0x43: 'Page Down',
  0x44: 'Previous',
  0x45: 'Next',
  0x46: 'Cancel',
  0x47: 'Data',
  0x60: 'Red Function',
  0x61: 'Green Function',
  0x62: 'Yellow Function',
  0x63: 'Blue Function',
  0x6F: 'Subtitle',
  0x71: 'Play',
  0x72: 'Pause',
  0x73: 'Record',
  0x74: 'Fast Forward',
  0x75: 'Rewind',
  0x76: 'Stop',
  0x77: 'Next Chapter',
  0x78: 'Previous Chapter',
  0x91: 'Channel Up',
  0x92: 'Channel Down',
  0x93: 'Previous Channel',
  0xA0: 'Sound Select',
  0xA1: 'Power On',
  0xA2: 'Power Off',
  0xA3: 'Blue',
  0xA4: 'Red',
  0xA5: 'Green',
  0xA6: 'Yellow',
  0xA7: 'Dot',
  0xA8: 'Cursor Up',
  0xA9: 'Cursor Down',
  0xAA: 'Cursor Left',
  0xAB: 'Cursor Right',
  0xAC: 'Enter'
};

function parseCECMessage(txMessage) {
  const message = txMessage.trim();
  if (!message || message.length < 4) {
    return null;
  }

  const bytes = [];
  for (let i = 0; i < message.length; i += 2) {
    bytes.push(parseInt(message.substr(i, 2), 16));
  }

  if (bytes.length < 2) {
    return null;
  }

  const header = bytes[0];
  const initiator = (header >> 4) & 0x0F;
  const destination = header & 0x0F;
  const opcode = bytes[1];
  const parameters = bytes.slice(2);

  const opcodeInfo = CEC_OPCODES[opcode] || {
    name: `Unknown (0x${opcode.toString(16).padStart(2, '0').toUpperCase()})`,
    description: '未知操作码',
    category: 'unknown'
  };

  let paramDetails = '';
  if (opcode === 0x41 && parameters.length > 0) {
    const keyCode = parameters[0];
    paramDetails = USER_CONTROL_CODES[keyCode] || `Key: 0x${keyCode.toString(16).padStart(2, '0').toUpperCase()}`;
  } else if (parameters.length > 0) {
    paramDetails = parameters.map(p => '0x' + p.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }

  return {
    raw: message,
    timestamp: new Date().toISOString(),
    initiator,
    initiatorName: CEC_DEVICES[initiator] || `Device 0x${initiator.toString(16)}`,
    destination,
    destinationName: CEC_DEVICES[destination] || `Device 0x${destination.toString(16)}`,
    opcode,
    opcodeHex: '0x' + opcode.toString(16).padStart(2, '0').toUpperCase(),
    opcodeName: opcodeInfo.name,
    description: opcodeInfo.description,
    category: opcodeInfo.category,
    parameters,
    paramDetails
  };
}

function buildCECMessage(initiator, destination, opcode, params = []) {
  const header = ((initiator & 0x0F) << 4) | (destination & 0x0F);
  const bytes = [header, opcode, ...params];
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function getOpcodeList() {
  return Object.entries(CEC_OPCODES).map(([code, info]) => ({
    code: parseInt(code),
    hex: '0x' + parseInt(code).toString(16).padStart(2, '0').toUpperCase(),
    ...info
  }));
}

function getDeviceList() {
  return Object.entries(CEC_DEVICES).map(([addr, name]) => ({
    address: parseInt(addr),
    hex: '0x' + parseInt(addr).toString(16),
    name
  }));
}

module.exports = {
  parseCECMessage,
  buildCECMessage,
  getOpcodeList,
  getDeviceList,
  CEC_OPCODES,
  CEC_DEVICES,
  USER_CONTROL_CODES
};
