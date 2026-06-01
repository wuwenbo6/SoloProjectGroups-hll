import type { STA, TWTParams, AccessPoint, Timeslot, TWTGroup } from '../../shared/types';

export interface NegotiationResult {
  success: boolean;
  reason?: string;
  params?: TWTParams;
  adjustments?: {
    offsetAdjusted: boolean;
    originalOffset: number;
    newOffset: number;
  };
  isBroadcast?: boolean;
  groupId?: string;
}

const GROUP_COLORS = [
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
];

export class AccessPointSimulator {
  private ap: AccessPoint;
  private allocatedSlots: Map<string, Timeslot[]> = new Map();
  private negotiatedSTAs: Set<string> = new Set();
  private negotiatedOffsets: Map<string, { interval: number; duration: number; offset: number }> = new Map();
  private twtGroups: Map<string, TWTGroup> = new Map();
  private groupCounter = 0;
  private maxWakeDurationRatio = 0.5;

  constructor() {
    this.ap = {
      id: 'ap-001',
      name: 'TWT-AP-01',
      maxSupportedSTAs: 32,
      twtCapability: {
        supportBroadcast: true,
        supportIndividual: true,
        minWakeInterval: 100,
        maxWakeInterval: 10000,
        minWakeDuration: 1,
        maxWakeDuration: 500,
      },
    };
  }

  getAccessPoint(): AccessPoint {
    return { ...this.ap };
  }

  private validateParams(requestedParams: TWTParams): { valid: boolean; reason?: string } {
    const { minWakeInterval, maxWakeInterval, minWakeDuration, maxWakeDuration } = this.ap.twtCapability;
    
    if (requestedParams.wakeInterval < minWakeInterval!) {
      return {
        valid: false,
        reason: `唤醒间隔 ${requestedParams.wakeInterval}ms 小于最小值 ${minWakeInterval}ms`,
      };
    }
    
    if (requestedParams.wakeInterval > maxWakeInterval) {
      return {
        valid: false,
        reason: `唤醒间隔 ${requestedParams.wakeInterval}ms 大于最大值 ${maxWakeInterval}ms`,
      };
    }
    
    if (requestedParams.wakeDuration < minWakeDuration!) {
      return {
        valid: false,
        reason: `唤醒时长 ${requestedParams.wakeDuration}ms 小于最小值 ${minWakeDuration}ms`,
      };
    }
    
    if (requestedParams.wakeDuration > maxWakeDuration!) {
      return {
        valid: false,
        reason: `唤醒时长 ${requestedParams.wakeDuration}ms 大于最大值 ${maxWakeDuration}ms`,
      };
    }
    
    if (requestedParams.wakeDuration > requestedParams.wakeInterval * this.maxWakeDurationRatio) {
      return {
        valid: false,
        reason: `唤醒时长 ${requestedParams.wakeDuration}ms 超过间隔的 50% (${Math.floor(requestedParams.wakeInterval * this.maxWakeDurationRatio)}ms)`,
      };
    }
    
    return { valid: true };
  }

  negotiateTWT(sta: STA, requestedParams: TWTParams): NegotiationResult {
    const validation = this.validateParams(requestedParams);
    
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason,
      };
    }
    
    let wakeInterval = requestedParams.wakeInterval;
    let wakeDuration = requestedParams.wakeDuration;
    let wakeOffset = requestedParams.wakeOffset % wakeInterval;
    
    const originalOffset = wakeOffset;
    wakeOffset = this.optimizeOffset(sta.id, wakeOffset, wakeInterval, wakeDuration);
    const offsetAdjusted = wakeOffset !== originalOffset;
    
    this.negotiatedSTAs.add(sta.id);
    this.negotiatedOffsets.set(sta.id, {
      interval: wakeInterval,
      duration: wakeDuration,
      offset: wakeOffset,
    });
    
    const result: NegotiationResult = {
      success: true,
      params: {
        wakeInterval,
        wakeDuration,
        wakeOffset,
      },
    };
    
    if (offsetAdjusted) {
      result.adjustments = {
        offsetAdjusted: true,
        originalOffset,
        newOffset: wakeOffset,
      };
    }
    
    return result;
  }

  private optimizeOffset(
    staId: string,
    requestedOffset: number,
    interval: number,
    duration: number
  ): number {
    const existingOffsets: { offset: number; duration: number; interval: number }[] = [];
    
    for (const [id, info] of this.negotiatedOffsets.entries()) {
      if (id === staId) continue;
      existingOffsets.push({
        offset: info.offset,
        duration: info.duration,
        interval: info.interval
      });
    }
    
    const hasCollision = (offset: number): boolean => {
      for (const existing of existingOffsets) {
        const lcmInterval = Math.max(interval, existing.interval);
        const wakeTimeA = offset;
        const wakeTimeB = existing.offset;
        const gap = Math.abs(wakeTimeA - wakeTimeB);
        const minGap = (duration + existing.duration) / 2 + 5;
        if (gap < minGap) {
          return true;
        }
      }
      return false;
    };
    
    if (!hasCollision(requestedOffset)) {
      return requestedOffset;
    }
    
    let bestOffset = requestedOffset;
    let maxMinGap = -1;
    
    for (let offset = 0; offset < interval; offset += Math.max(1, Math.floor(duration / 4))) {
      if (!hasCollision(offset)) {
        let currentMinGap = interval;
        for (const existing of existingOffsets) {
          const gap = Math.min(
            Math.abs(offset - existing.offset),
            interval - Math.abs(offset - existing.offset)
          );
          currentMinGap = Math.min(currentMinGap, gap);
        }
        if (currentMinGap > maxMinGap) {
          maxMinGap = currentMinGap;
          bestOffset = offset;
        }
      }
    }
    
    return Math.round(bestOffset);
  }

  allocateTimeslot(sta: STA, params: TWTParams, startTime: number, endTime: number): Timeslot[] {
    const slots: Timeslot[] = [];
    const { wakeInterval, wakeDuration, wakeOffset } = params;
    
    for (let t = startTime + wakeOffset; t < endTime; t += wakeInterval) {
      slots.push({
        staId: sta.id,
        startTime: t,
        duration: wakeDuration,
        type: 'wake',
      });
      
      slots.push({
        staId: sta.id,
        startTime: t - 1,
        duration: 1,
        type: 'transition',
      });
      
      slots.push({
        staId: sta.id,
        startTime: t + wakeDuration,
        duration: 1,
        type: 'transition',
      });
    }
    
    this.allocatedSlots.set(sta.id, slots);
    return slots;
  }

  getAvailableTimeslots(): Timeslot[] {
    const allSlots: Timeslot[] = [];
    for (const slots of this.allocatedSlots.values()) {
      allSlots.push(...slots);
    }
    return allSlots.sort((a, b) => a.startTime - b.startTime);
  }

  getSTAislot(staId: string): Timeslot[] {
    return this.allocatedSlots.get(staId) || [];
  }

  clearAllocations(): void {
    this.allocatedSlots.clear();
    this.negotiatedSTAs.clear();
    this.negotiatedOffsets.clear();
    this.twtGroups.clear();
    this.groupCounter = 0;
  }

  resetNegotiations(): void {
    this.allocatedSlots.clear();
    this.negotiatedSTAs.clear();
    this.negotiatedOffsets.clear();
    for (const [id, group] of this.twtGroups.entries()) {
      this.negotiatedOffsets.set(id, {
        interval: group.twtParams.wakeInterval,
        duration: group.twtParams.wakeDuration,
        offset: group.twtParams.wakeOffset,
      });
    }
  }

  isSTANegotiated(staId: string): boolean {
    return this.negotiatedSTAs.has(staId);
  }

  checkCollision(slot1: Timeslot, slot2: Timeslot): boolean {
    if (slot1.staId === slot2.staId) return false;
    if (slot1.type !== 'wake' || slot2.type !== 'wake') return false;
    
    const end1 = slot1.startTime + slot1.duration;
    const end2 = slot2.startTime + slot2.duration;
    
    return !(end1 <= slot2.startTime || end2 <= slot1.startTime);
  }

  createGroup(name: string, twtParams: TWTParams, staIds: string[]): TWTGroup {
    const validation = this.validateParams(twtParams);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const groupId = `group-${this.groupCounter++}`;
    const offset = this.optimizeOffset(groupId, twtParams.wakeOffset % twtParams.wakeInterval, twtParams.wakeInterval, twtParams.wakeDuration);

    const group: TWTGroup = {
      id: groupId,
      name,
      color: GROUP_COLORS[this.groupCounter % GROUP_COLORS.length],
      twtParams: { ...twtParams, wakeOffset: offset },
      staIds: [...staIds],
    };

    this.twtGroups.set(groupId, group);
    this.negotiatedOffsets.set(groupId, {
      interval: twtParams.wakeInterval,
      duration: twtParams.wakeDuration,
      offset: offset,
    });

    return group;
  }

  negotiateBroadcastTWT(stas: STA[], twtParams: TWTParams): NegotiationResult {
    const validation = this.validateParams(twtParams);
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason,
        isBroadcast: true,
      };
    }

    if (stas.length === 0) {
      return {
        success: false,
        reason: '广播TWT需要至少一个STA',
        isBroadcast: true,
      };
    }

    let wakeOffset = twtParams.wakeOffset % twtParams.wakeInterval;
    const originalOffset = wakeOffset;
    wakeOffset = this.optimizeOffset(
      `broadcast-${this.groupCounter}`,
      wakeOffset,
      twtParams.wakeInterval,
      twtParams.wakeDuration
    );
    const offsetAdjusted = wakeOffset !== originalOffset;

    const groupId = `group-${this.groupCounter++}`;
    const group: TWTGroup = {
      id: groupId,
      name: `广播组-${this.groupCounter}`,
      color: GROUP_COLORS[this.groupCounter % GROUP_COLORS.length],
      twtParams: { ...twtParams, wakeOffset },
      staIds: stas.map(s => s.id),
    };

    this.twtGroups.set(groupId, group);
    this.negotiatedOffsets.set(groupId, {
      interval: twtParams.wakeInterval,
      duration: twtParams.wakeDuration,
      offset: wakeOffset,
    });

    const negotiatedParams: TWTParams = {
      wakeInterval: twtParams.wakeInterval,
      wakeDuration: twtParams.wakeDuration,
      wakeOffset,
    };

    for (const sta of stas) {
      this.negotiatedSTAs.add(sta.id);
    }

    const result: NegotiationResult = {
      success: true,
      params: negotiatedParams,
      isBroadcast: true,
      groupId,
    };

    if (offsetAdjusted) {
      result.adjustments = {
        offsetAdjusted: true,
        originalOffset,
        newOffset: wakeOffset,
      };
    }

    return result;
  }

  getGroups(): TWTGroup[] {
    return Array.from(this.twtGroups.values());
  }

  getGroup(groupId: string): TWTGroup | undefined {
    return this.twtGroups.get(groupId);
  }

  removeGroup(groupId: string): boolean {
    const group = this.twtGroups.get(groupId);
    if (!group) return false;
    this.negotiatedOffsets.delete(groupId);
    for (const staId of group.staIds) {
      this.negotiatedSTAs.delete(staId);
    }
    this.twtGroups.delete(groupId);
    return true;
  }
}
