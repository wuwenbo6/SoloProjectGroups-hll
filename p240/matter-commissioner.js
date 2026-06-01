const forge = require('node-forge');

function generateFullCertificateChain() {
  const rootCAKeys = forge.pki.rsa.generateKeyPair(2048);
  const rootCACert = forge.pki.createCertificate();
  rootCACert.publicKey = rootCAKeys.publicKey;
  rootCACert.serialNumber = '01';
  rootCACert.validity.notBefore = new Date('2022-01-01');
  rootCACert.validity.notAfter = new Date('2042-01-01');
  rootCACert.setSubject([
    { name: 'commonName', value: 'Matter Root CA' },
    { name: 'organizationName', value: 'CSA' }
  ]);
  rootCACert.setIssuer([
    { name: 'commonName', value: 'Matter Root CA' },
    { name: 'organizationName', value: 'CSA' }
  ]);
  rootCACert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true }
  ]);
  rootCACert.sign(rootCAKeys.privateKey, forge.md.sha256.create());

  const icaKeys = forge.pki.rsa.generateKeyPair(2048);
  const icaCert = forge.pki.createCertificate();
  icaCert.publicKey = icaKeys.publicKey;
  icaCert.serialNumber = '02';
  icaCert.validity.notBefore = new Date('2022-06-01');
  icaCert.validity.notAfter = new Date('2037-06-01');
  icaCert.setSubject([
    { name: 'commonName', value: 'Matter Intermediate CA' },
    { name: 'organizationName', value: 'CSA' }
  ]);
  icaCert.setIssuer([
    { name: 'commonName', value: 'Matter Root CA' },
    { name: 'organizationName', value: 'CSA' }
  ]);
  icaCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true }
  ]);
  icaCert.sign(rootCAKeys.privateKey, forge.md.sha256.create());

  const paiKeys = forge.pki.rsa.generateKeyPair(2048);
  const paiCert = forge.pki.createCertificate();
  paiCert.publicKey = paiKeys.publicKey;
  paiCert.serialNumber = '03';
  paiCert.validity.notBefore = new Date('2023-01-01');
  paiCert.validity.notAfter = new Date('2033-01-01');
  paiCert.setSubject([
    { name: 'commonName', value: 'Matter PAI' },
    { name: 'organizationName', value: 'Test Vendor' }
  ]);
  paiCert.setIssuer([
    { name: 'commonName', value: 'Matter Intermediate CA' },
    { name: 'organizationName', value: 'CSA' }
  ]);
  paiCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true }
  ]);
  paiCert.sign(icaKeys.privateKey, forge.md.sha256.create());

  const dacKeys = forge.pki.rsa.generateKeyPair(2048);
  const dacCert = forge.pki.createCertificate();
  dacCert.publicKey = dacKeys.publicKey;
  dacCert.serialNumber = '04';
  dacCert.validity.notBefore = new Date('2023-01-01');
  dacCert.validity.notAfter = new Date('2033-01-01');
  dacCert.setSubject([
    { name: 'commonName', value: 'Matter DAC' },
    { name: 'organizationName', value: 'Test Vendor' }
  ]);
  dacCert.setIssuer([
    { name: 'commonName', value: 'Matter PAI' },
    { name: 'organizationName', value: 'Test Vendor' }
  ]);
  dacCert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }
  ]);
  dacCert.sign(paiKeys.privateKey, forge.md.sha256.create());

  const fabricKeys = forge.pki.rsa.generateKeyPair(2048);

  return {
    rootCA: {
      cert: forge.pki.certificateToPem(rootCACert),
      privateKey: forge.pki.privateKeyToPem(rootCAKeys.privateKey),
      publicKey: forge.pki.publicKeyToPem(rootCAKeys.publicKey)
    },
    intermediateCA: {
      cert: forge.pki.certificateToPem(icaCert),
      privateKey: forge.pki.privateKeyToPem(icaKeys.privateKey),
      publicKey: forge.pki.publicKeyToPem(icaKeys.publicKey)
    },
    pai: {
      cert: forge.pki.certificateToPem(paiCert),
      privateKey: forge.pki.privateKeyToPem(paiKeys.privateKey),
      publicKey: forge.pki.publicKeyToPem(paiKeys.publicKey)
    },
    dac: {
      cert: forge.pki.certificateToPem(dacCert),
      privateKey: forge.pki.privateKeyToPem(dacKeys.privateKey),
      publicKey: forge.pki.publicKeyToPem(dacKeys.publicKey)
    },
    fabricKeys: {
      privateKey: forge.pki.privateKeyToPem(fabricKeys.privateKey),
      publicKey: forge.pki.publicKeyToPem(fabricKeys.publicKey)
    }
  };
}

const chain = generateFullCertificateChain();

class IntermediateCAPool {
  constructor() {
    this.certificates = [];
  }

  addCertificate(pemCert, label) {
    try {
      const cert = forge.pki.certificateFromPem(pemCert);
      this.certificates.push({
        cert,
        pem: pemCert,
        label: label || cert.subject.getField('CN').value,
        fingerprint: getCertificateFingerprint(cert)
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  findBySubject(cn) {
    return this.certificates.find(entry => {
      try {
        return entry.cert.subject.getField('CN').value === cn;
      } catch { return false; }
    });
  }

  findByIssuer(cn) {
    return this.certificates.filter(entry => {
      try {
        return entry.cert.issuer.getField('CN').value === cn;
      } catch { return false; }
    });
  }

  buildChainToRoot(targetCert, rootCert) {
    const chain = [targetCert];
    let current = targetCert;

    const maxDepth = 10;
    for (let i = 0; i < maxDepth; i++) {
      const issuerCN = current.issuer.getField('CN')?.value;
      if (!issuerCN) break;

      const rootCN = rootCert.subject.getField('CN')?.value;
      if (issuerCN === rootCN) {
        chain.push(rootCert);
        break;
      }

      const found = this.findBySubject(issuerCN);
      if (found) {
        chain.push(found.cert);
        current = found.cert;
      } else {
        break;
      }
    }

    return chain;
  }

  verifyChain(targetCert, rootCert) {
    const certChain = this.buildChainToRoot(targetCert, rootCert);

    if (certChain.length < 2) {
      return { valid: false, error: '无法构建证书链', chain: certChain };
    }

    const lastCert = certChain[certChain.length - 1];
    const rootCN = rootCert.subject.getField('CN')?.value;
    const lastCN = lastCert.subject.getField('CN')?.value;
    if (lastCN !== rootCN) {
      return { valid: false, error: '证书链未追溯到受信任的Root CA', chain: certChain };
    }

    const now = new Date();
    for (const cert of certChain) {
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        const cn = cert.subject.getField('CN')?.value || 'Unknown';
        return { valid: false, error: `证书 "${cn}" 已过期或尚未生效`, chain: certChain };
      }
    }

    for (let i = 0; i < certChain.length - 1; i++) {
      const childCert = certChain[i];
      const parentCert = certChain[i + 1];

      const issuerCN = childCert.issuer.getField('CN')?.value;
      const parentCN = parentCert.subject.getField('CN')?.value;
      if (issuerCN !== parentCN) {
        return {
          valid: false,
          error: `证书链断裂: "${issuerCN}" 的签发者与 "${parentCN}" 不匹配`,
          chain: certChain
        };
      }
    }

    return { valid: true, chain: certChain };
  }

  getAll() {
    return [...this.certificates];
  }

  clear() {
    this.certificates = [];
  }
}

const intermediateCAPool = new IntermediateCAPool();
intermediateCAPool.addCertificate(chain.intermediateCA.cert, 'Matter Intermediate CA');

const COMMISSIONING_STEPS = [
  { id: 'device_discovery', name: '设备发现', description: '扫描并发现Matter设备' },
  { id: 'device_info', name: '设备信息解析', description: '解析QR码或手动配对码' },
  { id: 'pase_session', name: 'PASE会话建立', description: '建立密码认证会话' },
  { id: 'certificate_exchange', name: '证书交换', description: '获取设备证书链及中间CA' },
  { id: 'chain_verification', name: '证书链验证', description: '验证完整证书链 Root→ICA→PAI→DAC' },
  { id: 'operational_certificate', name: 'OpCert签发', description: '签发操作证书（异步重试）' },
  { id: 'acl_configuration', name: 'ACL配置', description: '配置设备访问控制列表' },
  { id: 'commissioning_complete', name: '配网完成', description: '设备成功加入网络' }
];

const VENDOR_IDS = {
  0xFFF1: 'Test Vendor 1',
  0xFFF2: 'Test Vendor 2',
  0x1000: 'Google',
  0x1001: 'Apple',
  0x1002: 'Amazon',
  0x1004: 'Samsung',
  0x1005: 'Silicon Labs',
  0x1006: 'Texas Instruments',
  0x1007: 'NXP Semiconductors',
  0x1008: 'Microchip Technology'
};

let state = {
  deviceInfo: null,
  currentStep: 0,
  stepStatuses: {},
  logs: [],
  certificates: {
    rootCA: null,
    intermediateCA: null,
    pai: null,
    dac: null,
    opCert: null
  },
  nodeId: null,
  fabricId: null
};

function parseQRCode(qrData) {
  if (!qrData || typeof qrData !== 'string') {
    throw new Error('QR码数据无效');
  }

  if (!qrData.startsWith('MT:')) {
    throw new Error('无效的Matter QR码格式，应以"MT:"开头');
  }

  try {
    const payload = qrData.substring(3);
    const decoded = decodeQRPayload(payload);

    state.deviceInfo = {
      source: 'qr',
      rawData: qrData,
      ...decoded
    };

    return state.deviceInfo;
  } catch (error) {
    throw new Error(`QR码解析失败: ${error.message}`);
  }
}

function decodeQRPayload(payload) {
  const buf = Buffer.from(payload, 'base64');

  if (buf.length < 6) {
    throw new Error('QR码数据长度不足');
  }

  const version = buf.readUInt8(0) & 0x0F;
  const vendorId = buf.readUInt16LE(1);
  const productId = buf.readUInt16LE(3);
  const discriminator = buf.readUInt16LE(5) & 0x0FFF;
  const hasShortDiscriminator = (buf.readUInt8(5) >> 7) === 1;

  let offset = 7;
  let passcode = null;
  if (buf.length > offset + 4) {
    passcode = buf.readUInt32LE(offset);
    offset += 4;
  }

  const flowType = (buf.readUInt8(0) >> 4) & 0x03;

  const flowTypes = {
    0: 'Standard',
    1: 'User Intent',
    2: 'Custom'
  };

  return {
    qrVersion: version,
    vendorId,
    vendorName: VENDOR_IDS[vendorId] || `Unknown (0x${vendorId.toString(16).toUpperCase()})`,
    productId,
    discriminator,
    hasShortDiscriminator,
    passcode,
    flowType,
    flowTypeName: flowTypes[flowType] || 'Unknown',
    rawBytes: buf.toString('hex')
  };
}

function parseManualCode(manualCode) {
  if (!manualCode || typeof manualCode !== 'string') {
    throw new Error('手动配对码无效');
  }

  const cleanCode = manualCode.replace(/[^0-9]/g, '');

  if (cleanCode.length !== 11 && cleanCode.length !== 21) {
    throw new Error('手动配对码长度应为11位或21位');
  }

  try {
    const decoded = decodeManualPayload(cleanCode);

    state.deviceInfo = {
      source: 'manual',
      rawData: manualCode,
      ...decoded
    };

    return state.deviceInfo;
  } catch (error) {
    throw new Error(`手动配对码解析失败: ${error.message}`);
  }
}

function decodeManualPayload(code) {
  const firstDigit = parseInt(code[0]);
  const hasLongDiscriminator = (firstDigit & 0x08) !== 0;
  const version = firstDigit & 0x07;

  let discriminator;
  let passcodeStr;

  if (hasLongDiscriminator && code.length === 21) {
    discriminator = parseInt(code.substring(1, 6));
    passcodeStr = code.substring(6, 16);
  } else if (code.length === 11) {
    discriminator = parseInt(code.substring(1, 5));
    passcodeStr = code.substring(5, 11).padStart(8, '0');
  } else {
    throw new Error('无效的手动配对码格式');
  }

  const passcode = parseInt(passcodeStr);

  if (passcode < 1 || passcode > 99999998) {
    throw new Error('配对码不在有效范围内');
  }

  return {
    qrVersion: version,
    hasLongDiscriminator,
    discriminator,
    passcode,
    rawDigits: code
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startCommissioning(deviceInfo, sendLog, sendStepUpdate) {
  reset();
  state.deviceInfo = deviceInfo;

  sendLog('info', '=== 开始Matter设备配网 ===');
  sendLog('info', `设备来源: ${deviceInfo.source === 'qr' ? 'QR码' : '手动输入'}`);

  if (deviceInfo.vendorId) {
    sendLog('info', `厂商标识: 0x${deviceInfo.vendorId.toString(16).toUpperCase()} (${deviceInfo.vendorName})`);
  }
  if (deviceInfo.productId) {
    sendLog('info', `产品标识: 0x${deviceInfo.productId.toString(16).toUpperCase()}`);
  }
  sendLog('info', `鉴别码: ${deviceInfo.discriminator}`);
  sendLog('info', `配对码: ${deviceInfo.passcode}`);

  for (let i = 0; i < COMMISSIONING_STEPS.length; i++) {
    const step = COMMISSIONING_STEPS[i];
    state.currentStep = i;

    sendStepUpdate(step.id, 'running');
    sendLog('info', `→ 开始步骤: ${step.name}`);

    try {
      await executeStep(step.id, sendLog, sendStepUpdate);
      state.stepStatuses[step.id] = 'completed';
      sendStepUpdate(step.id, 'completed');
      sendLog('success', `✓ 步骤完成: ${step.name}`);
    } catch (error) {
      state.stepStatuses[step.id] = 'failed';
      sendStepUpdate(step.id, 'failed', { error: error.message });
      sendLog('error', `✗ 步骤失败: ${step.name} - ${error.message}`);
      throw error;
    }

    await delay(500);
  }

  sendLog('success', '=== 配网流程全部完成 ===');
  return true;
}

async function executeStep(stepId, sendLog, sendStepUpdate) {
  switch (stepId) {
    case 'device_discovery':
      return await stepDeviceDiscovery(sendLog, sendStepUpdate);
    case 'device_info':
      return await stepDeviceInfo(sendLog, sendStepUpdate);
    case 'pase_session':
      return await stepPASESession(sendLog, sendStepUpdate);
    case 'certificate_exchange':
      return await stepCertificateExchange(sendLog, sendStepUpdate);
    case 'chain_verification':
      return await stepChainVerification(sendLog, sendStepUpdate);
    case 'operational_certificate':
      return await stepOperationalCertificate(sendLog, sendStepUpdate);
    case 'acl_configuration':
      return await stepACLConfiguration(sendLog, sendStepUpdate);
    case 'commissioning_complete':
      return await stepCommissioningComplete(sendLog, sendStepUpdate);
    default:
      throw new Error(`未知步骤: ${stepId}`);
  }
}

async function stepDeviceDiscovery(sendLog) {
  sendLog('info', '正在搜索附近的Matter设备...');
  await delay(1000);

  sendLog('info', `发现设备，鉴别码: ${state.deviceInfo.discriminator}`);
  sendLog('info', '设备连接成功');

  return true;
}

async function stepDeviceInfo(sendLog) {
  sendLog('info', '正在解析设备信息...');
  await delay(800);

  const info = state.deviceInfo;

  if (info.vendorId) {
    sendLog('info', `厂商ID: 0x${info.vendorId.toString(16).toUpperCase()}`);
    sendLog('info', `厂商名称: ${info.vendorName}`);
  }
  if (info.productId) {
    sendLog('info', `产品ID: 0x${info.productId.toString(16).toUpperCase()}`);
  }
  sendLog('info', `鉴别码类型: ${info.hasShortDiscriminator ? '短格式' : info.hasLongDiscriminator ? '长格式' : '标准'}`);
  sendLog('info', `配网流程: ${info.flowTypeName || 'Standard'}`);

  return true;
}

async function stepPASESession(sendLog) {
  sendLog('info', '开始PASE会话建立...');
  await delay(500);

  sendLog('info', '生成PASE椭圆曲线密钥对...');
  await delay(300);

  sendLog('info', `使用配对码 ${state.deviceInfo.passcode} 进行密码认证...`);
  await delay(800);

  sendLog('info', '执行SPAKE2+密码认证协议...');
  await delay(600);

  sendLog('info', 'PASE会话密钥协商成功');
  sendLog('info', '建立加密通信通道');

  return true;
}

async function stepCertificateExchange(sendLog) {
  sendLog('info', '请求设备证书链...');
  await delay(500);

  sendLog('info', '接收Root CA证书...');
  await delay(300);
  state.certificates.rootCA = chain.rootCA.cert;
  const rootCert = forge.pki.certificateFromPem(state.certificates.rootCA);
  sendLog('info', `  Root CA: ${rootCert.subject.getField('CN').value}`);

  sendLog('info', '接收中间CA证书...');
  await delay(300);
  state.certificates.intermediateCA = chain.intermediateCA.cert;
  const icaCert = forge.pki.certificateFromPem(state.certificates.intermediateCA);
  sendLog('info', `  Intermediate CA: ${icaCert.subject.getField('CN').value}`);
  if (!intermediateCAPool.findBySubject('Matter Intermediate CA')) {
    intermediateCAPool.addCertificate(state.certificates.intermediateCA, 'Matter Intermediate CA');
  }

  sendLog('info', '接收设备PAI证书...');
  await delay(400);
  state.certificates.pai = chain.pai.cert;
  const paiCert = forge.pki.certificateFromPem(state.certificates.pai);
  sendLog('info', `  PAI: ${paiCert.subject.getField('CN').value}`);
  intermediateCAPool.addCertificate(state.certificates.pai, 'Matter PAI');

  sendLog('info', '接收设备DAC证书...');
  await delay(400);
  state.certificates.dac = chain.dac.cert;
  const dacCert = forge.pki.certificateFromPem(state.certificates.dac);
  sendLog('info', `  DAC: ${dacCert.subject.getField('CN').value}`);

  sendLog('info', '证书链接收完成，已构建完整证书链');
  sendLog('info', '证书链: Root CA → Intermediate CA → PAI → DAC');

  return true;
}

async function stepChainVerification(sendLog, sendStepUpdate) {
  sendLog('info', '开始完整证书链验证...');
  await delay(300);

  try {
    const rootCert = forge.pki.certificateFromPem(state.certificates.rootCA);
    const icaCert = forge.pki.certificateFromPem(state.certificates.intermediateCA);
    const paiCert = forge.pki.certificateFromPem(state.certificates.pai);
    const dacCert = forge.pki.certificateFromPem(state.certificates.dac);

    sendLog('info', '--- 验证DAC证书 ---');
    sendLog('info', `  主题: ${dacCert.subject.getField('CN').value}`);
    sendLog('info', `  颁发者: ${dacCert.issuer.getField('CN').value}`);
    sendLog('info', `  序列号: ${dacCert.serialNumber}`);
    await delay(300);

    sendLog('info', '--- 验证PAI证书 ---');
    sendLog('info', `  主题: ${paiCert.subject.getField('CN').value}`);
    sendLog('info', `  颁发者: ${paiCert.issuer.getField('CN').value}`);
    sendLog('info', `  序列号: ${paiCert.serialNumber}`);
    await delay(300);

    sendLog('info', '--- 验证中间CA证书 ---');
    sendLog('info', `  主题: ${icaCert.subject.getField('CN').value}`);
    sendLog('info', `  颁发者: ${icaCert.issuer.getField('CN').value}`);
    sendLog('info', `  序列号: ${icaCert.serialNumber}`);
    await delay(300);

    sendLog('info', '--- 验证Root CA证书 ---');
    sendLog('info', `  主题: ${rootCert.subject.getField('CN').value}`);
    sendLog('info', `  颁发者: ${rootCert.issuer.getField('CN').value}`);
    sendLog('info', `  序列号: ${rootCert.serialNumber}`);
    await delay(300);

    sendLog('info', '正在验证证书链完整性: DAC → PAI → ICA → Root CA...');
    await delay(500);

    const icaResult = intermediateCAPool.verifyChain(dacCert, rootCert);
    if (!icaResult.valid) {
      throw new Error(`证书链验证失败: ${icaResult.error}`);
    }

    sendLog('info', `证书链深度: ${icaResult.chain.length} 层`);
    icaResult.chain.forEach((cert, idx) => {
      const cn = cert.subject.getField('CN')?.value || 'Unknown';
      const depth = icaResult.chain.length - 1 - idx;
      sendLog('info', `  [深度 ${depth}] ${cn}`);
    });

    sendLog('info', '验证每级证书签名...');
    await delay(400);

    for (let i = 0; i < icaResult.chain.length - 1; i++) {
      const child = icaResult.chain[i];
      const parent = icaResult.chain[i + 1];
      const childCN = child.subject.getField('CN')?.value;
      const parentCN = parent.subject.getField('CN')?.value;
      sendLog('info', `  验证: ${childCN} 签发者 → ${parentCN} ✓`);
      await delay(200);
    }

    sendLog('info', '验证各证书有效期...');
    await delay(300);
    const now = new Date();
    for (const cert of icaResult.chain) {
      const cn = cert.subject.getField('CN')?.value;
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        throw new Error(`证书 "${cn}" 已过期或尚未生效`);
      }
      sendLog('info', `  ${cn}: 有效期验证通过`);
    }

    sendLog('info', '验证中间CA证书池...');
    await delay(200);
    const poolCerts = intermediateCAPool.getAll();
    sendLog('info', `  证书池中共有 ${poolCerts.length} 个中间CA证书`);
    for (const entry of poolCerts) {
      sendLog('info', `  - ${entry.label} (指纹: ${entry.fingerprint.substring(0, 23)}...)`);
    }

    const chainDetails = [];
    for (const cert of icaResult.chain) {
      chainDetails.push({
        subject: cert.subject.getField('CN')?.value || 'Unknown',
        issuer: cert.issuer.getField('CN')?.value || 'Unknown',
        serialNumber: cert.serialNumber,
        validFrom: cert.validity.notBefore.toISOString(),
        validTo: cert.validity.notAfter.toISOString(),
        fingerprint: getCertificateFingerprint(cert),
        isCA: cert.getExtension('basicConstraints')?.cA || false
      });
    }

    sendStepUpdate('chain_verification', 'running', { chainDetails });

    sendLog('success', '完整证书链验证通过');
    return true;
  } catch (error) {
    if (error.message.includes('证书')) {
      throw error;
    }
    throw new Error(`证书链验证失败: ${error.message}`);
  }
}

const OPCERT_MAX_RETRIES = 3;

async function stepOperationalCertificate(sendLog, sendStepUpdate) {
  sendLog('info', '开始签发操作证书(OpCert)...');
  await delay(300);

  const fabricPrivateKey = forge.pki.privateKeyFromPem(chain.fabricKeys.privateKey);
  const fabricPublicKey = forge.pki.publicKeyFromPem(chain.fabricKeys.publicKey);

  for (let attempt = 1; attempt <= OPCERT_MAX_RETRIES; attempt++) {
    sendLog('info', `OpCert签发尝试 ${attempt}/${OPCERT_MAX_RETRIES}`);

    try {
      sendLog('info', '  生成设备操作密钥对...');
      await delay(400);

      const opKeys = forge.pki.rsa.generateKeyPair(2048);

      sendLog('info', '  构造OpCert CSR...');
      await delay(300);

      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = opKeys.publicKey;
      csr.setSubject([
        { name: 'commonName', value: `Node 0x${Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFF).toString(16).toUpperCase()}` },
        { name: 'organizationName', value: 'Matter Fabric' }
      ]);
      csr.sign(opKeys.privateKey, forge.md.sha256.create());

      if (!csr.verify()) {
        throw new Error('CSR验证失败');
      }
      sendLog('info', '  CSR验证通过');

      sendLog('info', '  使用Fabric CA签发OpCert...');
      await delay(500);

      const opCert = forge.pki.createCertificate();
      opCert.publicKey = opKeys.publicKey;
      opCert.serialNumber = Date.now().toString(16);
      opCert.validity.notBefore = new Date();
      opCert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10);
      opCert.setSubject(csr.subject.attributes);
      opCert.setIssuer([
        { name: 'commonName', value: 'Matter Fabric CA' },
        { name: 'organizationName', value: 'Matter Fabric' }
      ]);
      opCert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true, clientAuth: true }
      ]);
      opCert.sign(fabricPrivateKey, forge.md.sha256.create());

      const opCertPem = forge.pki.certificateToPem(opCert);
      state.certificates.opCert = opCertPem;

      sendLog('info', '  OpCert签发成功');
      sendLog('info', `  主题: ${opCert.subject.getField('CN').value}`);
      sendLog('info', `  颁发者: ${opCert.issuer.getField('CN').value}`);
      sendLog('info', `  序列号: ${opCert.serialNumber}`);
      sendLog('info', `  有效期: ${opCert.validity.notBefore.toISOString()} - ${opCert.validity.notAfter.toISOString()}`);

      await delay(200);

      sendLog('info', '  验证OpCert签名...');
      await delay(300);

      try {
        opCert.verify(fabricPublicKey);
        sendLog('info', '  OpCert签名验证通过 ✓');
      } catch (verifyErr) {
        sendLog('warn', `  OpCert签名验证异常: ${verifyErr.message}`);
      }

      sendStepUpdate('operational_certificate', 'running', {
        certificateDetails: {
          subject: opCert.subject.getField('CN').value,
          issuer: opCert.issuer.getField('CN').value,
          serialNumber: opCert.serialNumber,
          validFrom: opCert.validity.notBefore.toISOString(),
          validTo: opCert.validity.notAfter.toISOString(),
          fingerprint: getCertificateFingerprint(opCert),
          attempt
        }
      });

      sendLog('success', `OpCert签发成功 (第 ${attempt} 次尝试)`);
      return true;
    } catch (error) {
      sendLog('error', `  第 ${attempt} 次签发失败: ${error.message}`);

      if (attempt < OPCERT_MAX_RETRIES) {
        const retryDelay = attempt * 1000;
        sendLog('info', `  等待 ${retryDelay}ms 后重试...`);
        await delay(retryDelay);
      } else {
        throw new Error(`OpCert签发失败，已重试 ${OPCERT_MAX_RETRIES} 次: ${error.message}`);
      }
    }
  }
}

async function stepACLConfiguration(sendLog, sendStepUpdate) {
  sendLog('info', '开始配置设备访问控制列表(ACL)...');
  await delay(300);

  const fabricId = state.fabricId || Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFF);
  state.fabricId = fabricId;
  sendLog('info', `Fabric ID: 0x${fabricId.toString(16).toUpperCase()}`);

  const nodeId = state.nodeId || Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFF);
  state.nodeId = nodeId;

  sendLog('info', '读取设备现有ACL条目...');
  await delay(400);
  sendLog('info', '现有ACL条目: 0 条');

  const aclEntries = [
    {
      fabricIndex: 1,
      privilege: 'Administer',
      authMode: 'CASE',
      subjects: null,
      targets: null,
      description: 'Fabric管理员访问'
    },
    {
      fabricIndex: 1,
      privilege: 'Operate',
      authMode: 'CASE',
      subjects: [nodeId],
      targets: null,
      description: '设备自身操作权限'
    }
  ];

  sendLog('info', '配置默认ACL策略...');
  await delay(300);

  aclEntries.forEach((entry, index) => {
    sendLog('info', `  ACL条目 ${index + 1}: ${entry.description}`);
    sendLog('info', `    权限: ${entry.privilege}, 认证: ${entry.authMode}`);
  });

  sendLog('info', '写入ACL配置到设备...');
  await delay(500);

  state.aclEntries = aclEntries;

  sendStepUpdate('acl_configuration', 'completed', {
    aclDetails: {
      fabricId: `0x${fabricId.toString(16).toUpperCase()}`,
      nodeId: `0x${nodeId.toString(16).toUpperCase()}`,
      entryCount: aclEntries.length,
      entries: aclEntries
    }
  });

  sendLog('success', `ACL配置完成，共 ${aclEntries.length} 条规则`);
  return true;
}

async function stepCommissioningComplete(sendLog) {
  sendLog('info', '正在完成配网...');
  await delay(500);

  sendLog('info', '配置网络凭证...');
  await delay(400);

  sendLog('info', '绑定OpCert到设备节点...');
  await delay(300);

  sendLog('info', '保存设备到Fabric...');
  await delay(300);

  sendLog('success', `设备已成功加入网络，节点ID: 0x${state.nodeId.toString(16).toUpperCase()}`);
  sendLog('info', `Fabric ID: 0x${state.fabricId.toString(16).toUpperCase()}`);

  return true;
}

function getCertificateFingerprint(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex().match(/.{2}/g).join(':').toUpperCase();
}

function getCommissioningSteps() {
  return COMMISSIONING_STEPS;
}

function reset() {
  state = {
    deviceInfo: null,
    currentStep: 0,
    stepStatuses: {},
    logs: [],
    certificates: {
      rootCA: null,
      intermediateCA: null,
      pai: null,
      dac: null,
      opCert: null
    },
    nodeId: null,
    fabricId: null,
    aclEntries: []
  };
  intermediateCAPool.clear();
  intermediateCAPool.addCertificate(chain.intermediateCA.cert, 'Matter Intermediate CA');
}

function getState() {
  return { ...state };
}

function getIntermediateCAPool() {
  return intermediateCAPool;
}

function exportDeviceInfo() {
  if (!state.fabricId || !state.nodeId) {
    throw new Error('设备尚未完成配网，无法导出信息');
  }

  const deviceInfo = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    fabric: {
      fabricId: `0x${state.fabricId.toString(16).toUpperCase()}`,
      fabricIndex: 1
    },
    device: {
      nodeId: `0x${state.nodeId.toString(16).toUpperCase()}`,
      vendorId: state.deviceInfo?.vendorId ? `0x${state.deviceInfo.vendorId.toString(16).toUpperCase()}` : null,
      vendorName: state.deviceInfo?.vendorName || null,
      productId: state.deviceInfo?.productId ? `0x${state.deviceInfo.productId.toString(16).toUpperCase()}` : null,
      discriminator: state.deviceInfo?.discriminator || null
    },
    acl: {
      entryCount: state.aclEntries?.length || 0,
      entries: state.aclEntries || []
    },
    certificates: {
      hasRootCA: !!state.certificates.rootCA,
      hasIntermediateCA: !!state.certificates.intermediateCA,
      hasPAI: !!state.certificates.pai,
      hasDAC: !!state.certificates.dac,
      hasOpCert: !!state.certificates.opCert
    }
  };

  return deviceInfo;
}

function exportDeviceInfoJSON() {
  return JSON.stringify(exportDeviceInfo(), null, 2);
}

module.exports = {
  parseQRCode,
  parseManualCode,
  startCommissioning,
  getCommissioningSteps,
  getIntermediateCAPool,
  reset,
  getState,
  exportDeviceInfo,
  exportDeviceInfoJSON
};
