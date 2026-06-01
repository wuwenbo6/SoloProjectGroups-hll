import type { DmrFrame, DmrSlot, CallType, TimeSlotOccupancy, AnalysisResult, DemodulationResult, WavFileInfo, SyncPatternType } from './types';

const DMR_SYNC_WORD = 0x755FD7DF;
const DMR_SYNC_WORD_MS = 0x755FD7DF;
const DMR_SYNC_WORD_BS = 0x7DF755F7;

const DMR_SYNC_PATTERN_VOICE = 0x75F75F;
const DMR_SYNC_PATTERN_DATA = 0x75F75D;
const DMR_SYNC_PATTERN_LENGTH = 24;

const DMR_SYNC_LENGTH = 48;
const DMR_SLOT_LENGTH = 1800;
const DMR_SYMBOLS_PER_FRAME = 288;

const CRC_CCITT_POLY = 0x1021;
const CRC_CCITT_INIT = 0xFFFF;

const CSBK_TYPES: Record<number, string> = {
  0x00: 'UU_Voice_Request',
  0x01: 'UU_Answer_Response',
  0x02: 'BS_Dwn_Act',
  0x07: 'Group_Voice_Channel_User',
  0x0F: 'NACK',
  0x10: 'Preamble',
  0x11: 'MSG_ACK',
  0x20: 'RAND',
  0x21: 'AUTH_FAIL',
  0x22: 'BS_Outbound_Service',
  0x30: 'System_Parms',
  0x31: 'Neighbor_Site_Parms',
  0x32: 'Protect_Parms',
};

export class DmrParser {
  private symbolRate: number;
  private frames: DmrFrame[] = [];
  private currentCalls: Map<DmrSlot, { callType: CallType; startTime: number; sourceId?: number; destinationId?: number }> = new Map();

  constructor(symbolRate: number = 4800) {
    this.symbolRate = symbolRate;
  }

  parse(symbols: number[], sampleRate: number = 48000): DmrFrame[] {
    this.frames = [];
    this.currentCalls.clear();

    const bits = this.symbolsToBits(symbols);
    const syncResults = this.findSyncWords(bits);

    for (const syncResult of syncResults) {
      const frame = this.parseFrame(bits, syncResult.position, symbols, syncResult.patternType, sampleRate);
      if (frame) {
        this.frames.push(frame);
      }
    }

    return this.frames;
  }

  private symbolsToBits(symbols: number[]): Uint8Array {
    const bits = new Uint8Array(symbols.length * 2);
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      let value: number;
      switch (symbol) {
        case -3: value = 0; break;
        case -1: value = 1; break;
        case 1: value = 3; break;
        case 3: value = 2; break;
        default: value = 0;
      }
      bits[i * 2] = (value >> 1) & 1;
      bits[i * 2 + 1] = value & 1;
    }
    return bits;
  }

  private findSyncWords(bits: Uint8Array): Array<{ position: number; patternType: SyncPatternType }> {
    const results: Array<{ position: number; patternType: SyncPatternType }> = [];
    const syncPatterns: Array<{ pattern: number; length: number; type: SyncPatternType }> = [
      { pattern: DMR_SYNC_WORD, length: 32, type: 'ms_sync' },
      { pattern: DMR_SYNC_WORD_BS, length: 32, type: 'bs_sync' },
      { pattern: DMR_SYNC_PATTERN_VOICE, length: 24, type: 'voice_sync' },
      { pattern: DMR_SYNC_PATTERN_DATA, length: 24, type: 'data_sync' },
    ];

    for (let i = 0; i < bits.length - DMR_SYNC_LENGTH; i += 24) {
      let matched = false;
      for (const sp of syncPatterns) {
        const syncBits = this.hexToBits(sp.pattern, sp.length);
        if (this.matchSync(bits, i, syncBits) || this.matchSync(bits, i, this.invertBits(syncBits))) {
          results.push({ position: i, patternType: sp.type });
          i += DMR_SYMBOLS_PER_FRAME * 2 - DMR_SYNC_LENGTH;
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const sp of syncPatterns) {
          const syncBits = this.hexToBits(sp.pattern, sp.length);
          const matchResult = this.softMatchSync(bits, i, syncBits);
          if (matchResult.confidence >= 0.8) {
            results.push({ position: i, patternType: sp.type });
            i += DMR_SYMBOLS_PER_FRAME * 2 - DMR_SYNC_LENGTH;
            break;
          }
        }
      }
    }

    return results;
  }

  private hexToBits(hex: number, length: number): Uint8Array {
    const bits = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bits[i] = (hex >> (length - 1 - i)) & 1;
    }
    return bits;
  }

  private matchSync(bits: Uint8Array, offset: number, syncBits: Uint8Array): boolean {
    let mismatches = 0;
    for (let i = 0; i < syncBits.length && offset + i < bits.length; i++) {
      if (bits[offset + i] !== syncBits[i]) {
        mismatches++;
        if (mismatches > 4) return false;
      }
    }
    return mismatches <= 4;
  }

  private softMatchSync(bits: Uint8Array, offset: number, syncBits: Uint8Array): { confidence: number; mismatches: number } {
    let mismatches = 0;
    for (let i = 0; i < syncBits.length && offset + i < bits.length; i++) {
      if (bits[offset + i] !== syncBits[i]) {
        mismatches++;
      }
    }
    const confidence = 1 - mismatches / syncBits.length;
    return { confidence, mismatches };
  }

  private invertBits(bits: Uint8Array): Uint8Array {
    const inverted = new Uint8Array(bits.length);
    for (let i = 0; i < bits.length; i++) {
      inverted[i] = bits[i] ^ 1;
    }
    return inverted;
  }

  private crcCcitt(data: Uint8Array, length: number): number {
    let crc = CRC_CCITT_INIT;
    for (let i = 0; i < length && i < data.length; i++) {
      crc ^= (data[i] << 8);
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ CRC_CCITT_POLY;
        } else {
          crc = crc << 1;
        }
        crc &= 0xFFFF;
      }
    }
    return crc;
  }

  private crcCcittBits(bits: Uint8Array, offset: number, bitLength: number): number {
    const byteLength = Math.ceil(bitLength / 8);
    const data = new Uint8Array(byteLength);
    for (let i = 0; i < bitLength && offset + i < bits.length; i++) {
      if (bits[offset + i]) {
        data[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
      }
    }
    return this.crcCcitt(data, byteLength);
  }

  private verifyCrc(bits: Uint8Array, offset: number, dataLength: number, crcOffset: number): boolean {
    const calculatedCrc = this.crcCcittBits(bits, offset, dataLength);
    const receivedCrc = this.bitsToHex(bits, offset + crcOffset, 16);
    return calculatedCrc === receivedCrc;
  }

  private parseFrame(bits: Uint8Array, bitPos: number, symbols: number[], syncPattern: SyncPatternType = 'unknown', sampleRate: number = 48000): DmrFrame | null {
    const symbolPos = Math.floor(bitPos / 2);
    const timestamp = (symbolPos / this.symbolRate) * 1000;

    const slot = this.detectSlot(bits, bitPos);
    const frameType = this.detectFrameType(bits, bitPos, syncPattern);

    if (!slot || !frameType) return null;

    let callType: CallType = 'unknown';
    let sourceId: number | undefined;
    let destinationId: number | undefined;
    let talkgroupId: number | undefined;
    let colorCode: number | undefined;
    let crcValid: boolean = false;
    let crcValue: number | undefined;
    let voiceSamples: Float32Array | undefined;

    try {
      if (frameType === 'csbk') {
        const csbkInfo = this.parseCSBK(bits, bitPos);
        callType = 'csbk';
        sourceId = csbkInfo.sourceId;
        destinationId = csbkInfo.destinationId;
        talkgroupId = this.extractTalkgroupId(bits, bitPos, frameType);
        crcValid = this.verifyCrc(bits, bitPos + 64, 80, 144);
        crcValue = this.crcCcittBits(bits, bitPos + 64, 80);
      } else if (frameType === 'voice') {
        callType = this.detectVoiceCallType(bits, bitPos);
        const ids = this.extractIds(bits, bitPos);
        sourceId = ids.sourceId;
        destinationId = ids.destinationId;
        talkgroupId = this.extractTalkgroupId(bits, bitPos, frameType);
        colorCode = this.extractColorCode(bits, bitPos);
        crcValid = this.verifyCrc(bits, bitPos + 40, 96, 136);
        crcValue = this.crcCcittBits(bits, bitPos + 40, 96);
        voiceSamples = this.extractVoiceSamples(symbols, symbolPos, sampleRate);
      } else if (frameType === 'data') {
        callType = this.detectDataCallType(bits, bitPos);
        const ids = this.extractIds(bits, bitPos);
        sourceId = ids.sourceId;
        destinationId = ids.destinationId;
        crcValid = this.verifyCrc(bits, bitPos + 48, 88, 136);
        crcValue = this.crcCcittBits(bits, bitPos + 48, 88);
      }
    } catch {
      crcValid = false;
    }

    const rawData = this.extractPayload(bits, bitPos);

    return {
      slot,
      timestamp,
      frameType,
      callType,
      sourceId,
      destinationId,
      talkgroupId,
      colorCode,
      rawData,
      syncPattern,
      crcValid,
      crcValue,
      voiceSamples,
    };
  }

  private detectSlot(bits: Uint8Array, offset: number): DmrSlot | null {
    const syncPattern = this.bitsToHex(bits, offset, 32);
    if (syncPattern === DMR_SYNC_WORD_MS || syncPattern === DMR_SYNC_WORD) {
      return 1;
    } else if (syncPattern === DMR_SYNC_WORD_BS) {
      return 2;
    }
    return (Math.floor(offset / (DMR_SLOT_LENGTH * 2)) % 2 === 0) ? 1 : 2;
  }

  private detectFrameType(bits: Uint8Array, offset: number, syncPattern: SyncPatternType = 'unknown'): DmrFrame['frameType'] | null {
    if (syncPattern === 'voice_sync') {
      return 'voice';
    }
    if (syncPattern === 'data_sync') {
      return 'data';
    }

    const ftBits = this.bitsToHex(bits, offset + 56, 8);
    if (ftBits === 0xCC) return 'csbk';
    if (ftBits === 0xAA) return 'voice';
    if (ftBits === 0x55) return 'data';
    return 'sync';
  }

  private bitsToHex(bits: Uint8Array, offset: number, length: number): number {
    let value = 0;
    for (let i = 0; i < length && offset + i < bits.length; i++) {
      value = (value << 1) | bits[offset + i];
    }
    return value;
  }

  private parseCSBK(bits: Uint8Array, offset: number): { sourceId?: number; destinationId?: number; csbkType?: string } {
    const csbkTypeBits = this.bitsToHex(bits, offset + 64, 8);
    const csbkType = CSBK_TYPES[csbkTypeBits] || 'Unknown';

    const destinationId = this.bitsToHex(bits, offset + 80, 24);
    const sourceId = this.bitsToHex(bits, offset + 104, 24);

    return {
      sourceId,
      destinationId,
      csbkType,
    };
  }

  private detectVoiceCallType(bits: Uint8Array, offset: number): CallType {
    const callTypeBits = this.bitsToHex(bits, offset + 48, 4);
    if (callTypeBits === 0x0) return 'group_voice';
    if (callTypeBits === 0x1) return 'private_voice';
    return 'group_voice';
  }

  private detectDataCallType(bits: Uint8Array, offset: number): CallType {
    const callTypeBits = this.bitsToHex(bits, offset + 48, 4);
    if (callTypeBits === 0x0) return 'group_data';
    if (callTypeBits === 0x1) return 'private_data';
    return 'group_data';
  }

  private extractIds(bits: Uint8Array, offset: number): { sourceId?: number; destinationId?: number } {
    try {
      const destinationId = this.bitsToHex(bits, offset + 72, 24);
      const sourceId = this.bitsToHex(bits, offset + 96, 24);
      return { sourceId, destinationId };
    } catch {
      return {};
    }
  }

  private extractColorCode(bits: Uint8Array, offset: number): number | undefined {
    try {
      return this.bitsToHex(bits, offset + 40, 4);
    } catch {
      return undefined;
    }
  }

  private extractTalkgroupId(bits: Uint8Array, offset: number, frameType: DmrFrame['frameType']): number | undefined {
    try {
      if (frameType === 'voice') {
        return this.bitsToHex(bits, offset + 72, 24);
      }
      if (frameType === 'csbk') {
        return this.bitsToHex(bits, offset + 80, 24);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractVoiceSamples(symbols: number[], symbolPos: number, sampleRate: number): Float32Array | undefined {
    try {
      const samplesPerSymbol = Math.floor(sampleRate / this.symbolRate);
      const frameSymbols = DMR_SYMBOLS_PER_FRAME;
      const totalSamples = frameSymbols * samplesPerSymbol;
      
      if (symbolPos + frameSymbols > symbols.length) return undefined;
      
      const samples = new Float32Array(totalSamples);
      for (let i = 0; i < frameSymbols; i++) {
        const symbol = symbols[symbolPos + i] || 0;
        const normalizedSymbol = symbol / 3;
        for (let j = 0; j < samplesPerSymbol; j++) {
          samples[i * samplesPerSymbol + j] = normalizedSymbol;
        }
      }
      return samples;
    } catch {
      return undefined;
    }
  }

  private extractPayload(bits: Uint8Array, offset: number): Uint8Array {
    const payloadLength = Math.min(DMR_SYMBOLS_PER_FRAME * 2, bits.length - offset);
    const payload = new Uint8Array(Math.ceil(payloadLength / 8));

    for (let i = 0; i < payloadLength && offset + i < bits.length; i++) {
      if (bits[offset + i]) {
        payload[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
      }
    }

    return payload;
  }

  generateTimeSlots(frames: DmrFrame[]): Array<TimeSlotOccupancy & { voiceSamples: Float32Array[] }> {
    const timeSlots: Array<TimeSlotOccupancy & { voiceSamples: Float32Array[] }> = [];
    const maxGap = 200;

    const slotFrames = new Map<DmrSlot, DmrFrame[]>();
    slotFrames.set(1, []);
    slotFrames.set(2, []);

    for (const frame of frames) {
      slotFrames.get(frame.slot)?.push(frame);
    }

    for (const [slot, frameList] of slotFrames) {
      if (frameList.length === 0) continue;

      frameList.sort((a, b) => a.timestamp - b.timestamp);

      let currentCall: {
        callType: CallType;
        startTime: number;
        endTime: number;
        sourceId?: number;
        destinationId?: number;
        talkgroupId?: number;
        voiceSamples: Float32Array[];
        frameCount: number;
      } | null = null;

      for (const frame of frameList) {
        if (!currentCall) {
          currentCall = {
            callType: frame.callType,
            startTime: frame.timestamp,
            endTime: frame.timestamp + (DMR_SYMBOLS_PER_FRAME / this.symbolRate) * 1000,
            sourceId: frame.sourceId,
            destinationId: frame.destinationId,
            talkgroupId: frame.talkgroupId,
            voiceSamples: frame.voiceSamples ? [frame.voiceSamples] : [],
            frameCount: 1,
          };
        } else {
          const gap = frame.timestamp - currentCall.endTime;
          if (gap < maxGap && frame.callType === currentCall.callType) {
            currentCall.endTime = frame.timestamp + (DMR_SYMBOLS_PER_FRAME / this.symbolRate) * 1000;
            if (frame.sourceId && !currentCall.sourceId) currentCall.sourceId = frame.sourceId;
            if (frame.destinationId && !currentCall.destinationId) currentCall.destinationId = frame.destinationId;
            if (frame.talkgroupId && !currentCall.talkgroupId) currentCall.talkgroupId = frame.talkgroupId;
            if (frame.voiceSamples) currentCall.voiceSamples.push(frame.voiceSamples);
            currentCall.frameCount++;
          } else {
            timeSlots.push({
              slot,
              startTime: currentCall.startTime,
              endTime: currentCall.endTime,
              callType: currentCall.callType,
              sourceId: currentCall.sourceId,
              destinationId: currentCall.destinationId,
              talkgroupId: currentCall.talkgroupId,
              duration: currentCall.endTime - currentCall.startTime,
              frameCount: currentCall.frameCount,
              voiceSamples: currentCall.voiceSamples,
            });

            currentCall = {
              callType: frame.callType,
              startTime: frame.timestamp,
              endTime: frame.timestamp + (DMR_SYMBOLS_PER_FRAME / this.symbolRate) * 1000,
              sourceId: frame.sourceId,
              destinationId: frame.destinationId,
              talkgroupId: frame.talkgroupId,
              voiceSamples: frame.voiceSamples ? [frame.voiceSamples] : [],
              frameCount: 1,
            };
          }
        }
      }

      if (currentCall) {
        timeSlots.push({
          slot,
          startTime: currentCall.startTime,
          endTime: currentCall.endTime,
          callType: currentCall.callType,
          sourceId: currentCall.sourceId,
          destinationId: currentCall.destinationId,
          talkgroupId: currentCall.talkgroupId,
          duration: currentCall.endTime - currentCall.startTime,
          frameCount: currentCall.frameCount,
          voiceSamples: currentCall.voiceSamples,
        });
      }
    }

    return timeSlots.sort((a, b) => a.startTime - b.startTime);
  }

  generateStatistics(frames: DmrFrame[], timeSlots: TimeSlotOccupancy[], duration: number): AnalysisResult['callStatistics'] {
    const byType: Record<CallType, number> = {
      group_voice: 0,
      private_voice: 0,
      group_data: 0,
      private_data: 0,
      csbk: 0,
      unknown: 0,
    };

    const bySlot: Record<DmrSlot, number> = {
      1: 0,
      2: 0,
    };

    for (const ts of timeSlots) {
      byType[ts.callType]++;
      bySlot[ts.slot]++;
    }

    let totalDuration = 0;
    for (const ts of timeSlots) {
      totalDuration += ts.duration;
    }

    return {
      totalCalls: timeSlots.length,
      byType,
      bySlot,
      totalDuration,
    };
  }

  static generateTestData(duration: number, sampleRate: number, symbolRate: number): { symbols: number[]; frames: DmrFrame[] } {
    const totalSymbols = Math.floor(duration * symbolRate);
    const symbols: number[] = [];
    const frames: DmrFrame[] = [];

    for (let i = 0; i < totalSymbols; i++) {
      if (i % DMR_SYMBOLS_PER_FRAME === 0 && Math.random() > 0.3) {
        const slot: DmrSlot = Math.random() > 0.5 ? 1 : 2;
        const frameTypes: Array<'voice' | 'data' | 'csbk'> = ['voice', 'voice', 'voice', 'data', 'csbk'];
        const frameType = frameTypes[Math.floor(Math.random() * frameTypes.length)];
        const callTypes: CallType[] = ['group_voice', 'private_voice', 'group_data', 'csbk'];
        const callType = callTypes[Math.floor(Math.random() * callTypes.length)];

        frames.push({
          slot,
          timestamp: (i / symbolRate) * 1000,
          frameType,
          callType,
          sourceId: Math.floor(Math.random() * 100000) + 1000,
          destinationId: Math.floor(Math.random() * 10000) + 100,
          colorCode: Math.floor(Math.random() * 16),
        });
      }
      symbols.push([-3, -1, 1, 3][Math.floor(Math.random() * 4)]);
    }

    return { symbols, frames };
  }
}
