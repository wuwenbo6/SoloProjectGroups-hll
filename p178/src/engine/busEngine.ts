import type { BusNode, BusLevel, FrameBit, WaveformSample, LogEntry, BackoffResult, ArbitrationResult, ModbusRTUFrame, BusStatistics, FullSimulationResult } from '../types/bus';

export function hexToBits(hex: string): BusLevel[] {
  const cleanHex = hex.replace(/0x/gi, '').replace(/\s/g, '');
  const bits: BusLevel[] = [];
  for (const char of cleanHex) {
    const nibble = parseInt(char, 16);
    for (let i = 3; i >= 0; i--) {
      bits.push(((nibble >> i) & 1) as BusLevel);
    }
  }
  return bits;
}

export function byteToBits(byte: number): BusLevel[] {
  const bits: BusLevel[] = [];
  for (let i = 7; i >= 0; i--) {
    bits.push(((byte >> i) & 1) as BusLevel);
  }
  return bits;
}

export function addressToBits(address: number): BusLevel[] {
  return byteToBits(address);
}

export function calculateCRC16(data: number[]): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

export function buildModbusRTUFrame(slaveAddress: number, functionCode: number, dataBytes: number[]): ModbusRTUFrame {
  const pdu: number[] = [slaveAddress, functionCode, ...dataBytes];
  const crc = calculateCRC16(pdu);
  const crcLow = crc & 0xFF;
  const crcHigh = (crc >> 8) & 0xFF;
  return {
    slaveAddress,
    functionCode,
    data: dataBytes,
    crcLow,
    crcHigh,
    rawBytes: [...pdu, crcLow, crcHigh],
  };
}

export function buildFrame(address: number, dataHex: string, useModbus: boolean = true): { bits: FrameBit[]; modbusFrame?: ModbusRTUFrame } {
  const frame: FrameBit[] = [];

  if (useModbus) {
    const dataBytes: number[] = [];
    const cleanHex = dataHex.replace(/0x/gi, '').replace(/\s/g, '');
    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = parseInt(cleanHex.slice(i, i + 2), 16);
      if (!isNaN(byte)) {
        dataBytes.push(byte);
      }
    }
    if (dataBytes.length === 0) {
      dataBytes.push(0);
    }

    const functionCode = 0x03;
    const modbusFrame = buildModbusRTUFrame(address, functionCode, dataBytes);

    modbusFrame.rawBytes.forEach((byte, byteIdx) => {
      let phase: FrameBit['phase'] = 'data';
      if (byteIdx === 0) phase = 'address';
      else if (byteIdx === 1) phase = 'function';
      else if (byteIdx >= modbusFrame.rawBytes.length - 2) phase = 'crc';

      frame.push({ value: 0, phase: 'start', bitIndex: byteIdx });

      const bits = byteToBits(byte);
      bits.forEach((bit, bitIdx) => {
        frame.push({ value: bit, phase, bitIndex: bitIdx });
      });

      frame.push({ value: 1, phase: 'stop', bitIndex: byteIdx });
    });

    return { bits: frame, modbusFrame };
  } else {
    frame.push({ value: 0, phase: 'start', bitIndex: 0 });
    const addrBits = addressToBits(address);
    addrBits.forEach((bit, i) => {
      frame.push({ value: bit, phase: 'address', bitIndex: i });
    });
    const dataBits = hexToBits(dataHex);
    dataBits.forEach((bit, i) => {
      frame.push({ value: bit, phase: 'data', bitIndex: i });
    });
    frame.push({ value: 1, phase: 'stop', bitIndex: 0 });
    return { bits: frame };
  }
}

export function computeBusLevel(txLevels: BusLevel[]): BusLevel {
  if (txLevels.length === 0) return 1;
  return txLevels.some(l => l === 0) ? 0 : 1;
}

export function calculateExponentialBackoff(backoffCount: number, maxBackoff = 10): { delay: number; maxDelay: number } {
  const cappedCount = Math.min(backoffCount, maxBackoff);
  const maxDelay = Math.pow(2, cappedCount) - 1;
  const delay = Math.floor(Math.random() * (maxDelay + 1));
  return { delay, maxDelay };
}

const BIT_DURATION = 1;
const SLOT_TIME = 2;

export function runSingleArbitration(
  nodes: BusNode[],
  sendingNodeIds: string[],
  startTime: number = 0,
  useModbus: boolean = true
): ArbitrationResult {
  const sendingNodes = nodes.filter(n => sendingNodeIds.includes(n.id));
  if (sendingNodes.length === 0) {
    return {
      winnerNodeId: null,
      winnerAddress: null,
      losers: [],
      collisionBitIndex: null,
      waveform: [],
      logs: [],
      backoffDelays: [],
    };
  }

  const waveform: WaveformSample[] = [];
  const logs: LogEntry[] = [];
  const nodeFrames: Record<string, FrameBit[]> = {};
  const nodeModbusFrames: Record<string, ModbusRTUFrame | undefined> = {};
  const lostNodes = new Set<string>();

  sendingNodes.forEach(node => {
    const { bits, modbusFrame } = buildFrame(node.address, node.data, useModbus);
    nodeFrames[node.id] = bits;
    nodeModbusFrames[node.id] = modbusFrame;
  });

  const firstModbusFrame = nodeModbusFrames[sendingNodes[0].id];
  if (firstModbusFrame) {
    logs.push({
      id: crypto.randomUUID(),
      timestamp: startTime,
      type: 'send',
      message: `${sendingNodes.length} 个节点开始发送 Modbus RTU 帧: ${sendingNodes.map(n => `${n.name}(地址:0x${n.address.toString(16).padStart(2, '0')})`).join(', ')}`,
    });
    logs.push({
      id: crypto.randomUUID(),
      timestamp: startTime,
      type: 'info',
      message: `Modbus RTU 帧: 从机=0x${firstModbusFrame.slaveAddress.toString(16).padStart(2, '0')}, 功能码=0x${firstModbusFrame.functionCode.toString(16).padStart(2, '0')}, CRC=0x${(firstModbusFrame.crcHigh << 8 | firstModbusFrame.crcLow).toString(16).padStart(4, '0')}`,
    });
  } else {
    logs.push({
      id: crypto.randomUUID(),
      timestamp: startTime,
      type: 'send',
      message: `${sendingNodes.length} 个节点开始发送: ${sendingNodes.map(n => `${n.name}(地址:0x${n.address.toString(16).padStart(2, '0')})`).join(', ')}`,
    });
  }

  let time = startTime;
  let collisionBitIndex: number | null = null;
  const maxFrameLength = Math.max(...sendingNodes.map(n => nodeFrames[n.id].length));

  const busIdleSample: WaveformSample = { time, nodeId: 'bus', level: 1, type: 'bus' };
  waveform.push(busIdleSample);
  sendingNodes.forEach(node => {
    waveform.push({ time, nodeId: node.id, level: 1, type: 'tx' });
  });

  for (let bitIdx = 0; bitIdx < maxFrameLength; bitIdx++) {
    const activeNodes = sendingNodes.filter(n => !lostNodes.has(n.id));
    const txLevels: Record<string, BusLevel> = {};
    let hasTx = false;

    activeNodes.forEach(node => {
      const frame = nodeFrames[node.id];
      if (bitIdx < frame.length) {
        const bit = frame[bitIdx];
        txLevels[node.id] = bit.value;
        hasTx = true;
        waveform.push({ time, nodeId: node.id, level: bit.value, type: 'tx' });
      } else {
        txLevels[node.id] = 1;
        waveform.push({ time, nodeId: node.id, level: 1, type: 'tx' });
      }
    });

    const busLevel = hasTx ? computeBusLevel(Object.values(txLevels)) : 1;
    waveform.push({ time, nodeId: 'bus', level: busLevel, type: 'bus' });

    if (hasTx && activeNodes.length > 1) {
      for (const node of activeNodes) {
        const frame = nodeFrames[node.id];
        if (bitIdx < frame.length) {
          const bit = frame[bitIdx];
          if (bit.value === 1 && busLevel === 0) {
            lostNodes.add(node.id);
            if (collisionBitIndex === null) {
              collisionBitIndex = bitIdx;
              const currentBit = frame[bitIdx];
              const bitDescription = currentBit.phase === 'address'
                ? `地址位第${currentBit.bitIndex + 1}位`
                : currentBit.phase === 'function'
                  ? `功能码位第${currentBit.bitIndex + 1}位`
                  : currentBit.phase === 'start'
                    ? '起始位'
                    : currentBit.phase === 'data'
                      ? `数据位第${currentBit.bitIndex + 1}位`
                      : currentBit.phase === 'crc'
                        ? `CRC位第${currentBit.bitIndex + 1}位`
                        : '停止位';

              logs.push({
                id: crypto.randomUUID(),
                timestamp: time,
                type: 'collision',
                message: `冲突检测: ${node.name}(0x${node.address.toString(16).padStart(2, '0')}) 在${bitDescription}发送隐性(1)但总线为显性(0)，丢失仲裁`,
                nodeId: node.id,
              });

              const remainingActive = activeNodes.filter(n => n.id !== node.id);
              if (remainingActive.length === 1) {
                logs.push({
                  id: crypto.randomUUID(),
                  timestamp: time,
                  type: 'arbitration',
                  message: `仲裁完成: ${remainingActive[0].name}(0x${remainingActive[0].address.toString(16).padStart(2, '0')}) 获胜`,
                  nodeId: remainingActive[0].id,
                });
              }
            }
          }
        }
      }
    }

    const stillActive = activeNodes.filter(n => !lostNodes.has(n.id));
    if (stillActive.length === 1 && sendingNodes.length > 1) {
      if (collisionBitIndex !== null) {
        break;
      }
    }

    time += BIT_DURATION;
  }

  const finalActive = sendingNodes.filter(n => !lostNodes.has(n.id));
  const winner = finalActive.length === 1 ? finalActive[0] : null;

  const backoffDelays: BackoffResult[] = [];
  if (winner && sendingNodes.length > 1) {
    const winnerModbusFrame = nodeModbusFrames[winner.id];
    if (winnerModbusFrame) {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: time,
        type: 'complete',
        message: `${winner.name} 成功发送 Modbus RTU 帧 | 从机:0x${winnerModbusFrame.slaveAddress.toString(16).padStart(2, '0')} | 功能码:0x${winnerModbusFrame.functionCode.toString(16).padStart(2, '0')} | CRC:0x${(winnerModbusFrame.crcHigh << 8 | winnerModbusFrame.crcLow).toString(16).padStart(4, '0')} ✓`,
        nodeId: winner.id,
      });
    } else {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: time,
        type: 'complete',
        message: `${winner.name}(0x${winner.address.toString(16).padStart(2, '0')}) 成功发送数据: ${winner.data}`,
        nodeId: winner.id,
      });
    }

    lostNodes.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const newBackoffCount = (node.backoffCount || 0) + 1;
        const { delay, maxDelay } = calculateExponentialBackoff(newBackoffCount);
        backoffDelays.push({
          nodeId,
          backoffCount: newBackoffCount,
          delay,
          maxDelay,
        });
        logs.push({
          id: crypto.randomUUID(),
          timestamp: time,
          type: 'backoff',
          message: `${node.name} 进入指数退避: 第${newBackoffCount}次冲突, 等待${delay}个时隙(最大${maxDelay})`,
          nodeId,
        });
      }
    });
  } else if (sendingNodes.length === 1) {
    const node = sendingNodes[0];
    const modbusFrame = nodeModbusFrames[node.id];
    if (modbusFrame) {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: time,
        type: 'complete',
        message: `${node.name} 无冲突发送 Modbus RTU 帧 | CRC:0x${(modbusFrame.crcHigh << 8 | modbusFrame.crcLow).toString(16).padStart(4, '0')} ✓`,
        nodeId: node.id,
      });
    } else {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: time,
        type: 'complete',
        message: `${node.name}(0x${node.address.toString(16).padStart(2, '0')}) 无冲突发送完成`,
        nodeId: node.id,
      });
    }
  }

  return {
    winnerNodeId: winner?.id ?? (sendingNodes.length === 1 ? sendingNodes[0].id : null),
    winnerAddress: winner?.address ?? (sendingNodes.length === 1 ? sendingNodes[0].address : null),
    losers: Array.from(lostNodes),
    collisionBitIndex,
    waveform,
    logs,
    backoffDelays,
    modbusFrame: winner ? nodeModbusFrames[winner.id] : undefined,
  };
}

export function calculateBusStatistics(
  waveform: WaveformSample[],
  totalRounds: number,
  successfulFrames: number,
  failedFrames: number
): BusStatistics {
  if (waveform.length === 0) {
    return {
      totalBits: 0,
      activeBits: 0,
      idleBits: 0,
      collisionBits: 0,
      utilization: 0,
      totalFrames: 0,
      successfulFrames: 0,
      failedFrames: 0,
      averageFrameSize: 0,
    };
  }

  const busSamples = waveform.filter(w => w.nodeId === 'bus').sort((a, b) => a.time - b.time);
  const totalBits = busSamples.length;

  let activeBits = 0;
  let idleBits = 0;
  let collisionBits = 0;
  let inCollision = false;
  let collisionStart = 0;

  for (let i = 1; i < busSamples.length; i++) {
    const prev = busSamples[i - 1];
    const curr = busSamples[i];

    if (curr.level === 0) {
      activeBits++;
    } else {
      idleBits++;
    }

    if (prev.level !== curr.level) {
      if (curr.level === 0 && !inCollision) {
        inCollision = true;
        collisionStart = i;
      } else if (curr.level === 1 && inCollision) {
        collisionBits += i - collisionStart;
        inCollision = false;
      }
    }
  }

  if (inCollision) {
    collisionBits += busSamples.length - collisionStart;
  }

  const utilization = totalBits > 0 ? (activeBits / totalBits) * 100 : 0;
  const totalFrames = successfulFrames + failedFrames;
  const averageFrameSize = totalFrames > 0 ? Math.round(totalBits / totalFrames) : 0;

  return {
    totalBits,
    activeBits,
    idleBits,
    collisionBits,
    utilization: Math.round(utilization * 10) / 10,
    totalFrames,
    successfulFrames,
    failedFrames,
    averageFrameSize,
  };
}

export function runFullSimulation(
  nodes: BusNode[],
  sendingNodeIds: string[],
  maxRounds: number = 5,
  useModbus: boolean = true
): FullSimulationResult {
  const allWaveform: WaveformSample[] = [];
  const allLogs: LogEntry[] = [];
  const nodeBackoffCounts: Record<string, number> = {};
  const nodeBackoffDelays: Record<string, number> = {};
  const allLosers: string[] = [];
  const successfulModbusFrames: ModbusRTUFrame[] = [];

  sendingNodeIds.forEach(id => {
    nodeBackoffCounts[id] = 0;
    nodeBackoffDelays[id] = 0;
  });

  let currentTime = 0;
  let currentSenders = [...sendingNodeIds];
  let finalWinner: string | null = null;
  let finalWinnerAddress: number | null = null;
  let totalRounds = 0;
  let successfulFrames = 0;
  let failedFrames = 0;

  for (let round = 0; round < maxRounds && currentSenders.length > 0; round++) {
    totalRounds = round + 1;

    const nodesWithBackoff: BusNode[] = nodes.map(n => ({
      ...n,
      backoffCount: nodeBackoffCounts[n.id] || 0,
      backoffDelay: nodeBackoffDelays[n.id] || 0,
    }));

    const result = runSingleArbitration(nodesWithBackoff, currentSenders, currentTime, useModbus);

    allWaveform.push(...result.waveform);
    allLogs.push(...result.logs);

    if (result.winnerNodeId) {
      finalWinner = result.winnerNodeId;
      finalWinnerAddress = result.winnerAddress;
      successfulFrames++;

      if (result.modbusFrame) {
        successfulModbusFrames.push(result.modbusFrame);
      }

      result.losers.forEach(loserId => {
        allLosers.push(loserId);
        failedFrames++;
      });

      result.backoffDelays.forEach(backoff => {
        nodeBackoffCounts[backoff.nodeId] = backoff.backoffCount;
        nodeBackoffDelays[backoff.nodeId] = backoff.delay;
      });

      const remainingLosers = result.losers;
      if (remainingLosers.length === 0) {
        break;
      }

      const maxDelay = Math.max(...result.backoffDelays.map(b => b.delay));
      currentTime += maxDelay * SLOT_TIME + 10;

      currentSenders = remainingLosers;

      if (round < maxRounds - 1) {
        allLogs.push({
          id: crypto.randomUUID(),
          timestamp: currentTime,
          type: 'info',
          message: `--- 第${round + 2}轮仲裁开始 ---`,
        });

        const busIdleSample: WaveformSample = { time: currentTime, nodeId: 'bus', level: 1, type: 'bus' };
        allWaveform.push(busIdleSample);

        remainingLosers.forEach(nodeId => {
          allWaveform.push({ time: currentTime, nodeId, level: 1, type: 'tx' });
        });
      }
    } else {
      break;
    }
  }

  const statistics = calculateBusStatistics(allWaveform, totalRounds, successfulFrames, failedFrames);

  return {
    waveform: allWaveform,
    logs: allLogs,
    winnerNodeId: finalWinner,
    winnerAddress: finalWinnerAddress,
    loserNodeIds: allLosers,
    nodeBackoffCounts,
    nodeBackoffDelays,
    totalRounds,
    statistics,
    successfulModbusFrames,
  };
}

export function generateNodeId(): string {
  return `node_${crypto.randomUUID().slice(0, 8)}`;
}
