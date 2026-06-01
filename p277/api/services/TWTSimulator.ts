import { AccessPointSimulator, type NegotiationResult } from './AP';
import { STASimulator } from './STA';
import { TimeslotCalculator } from './TimeslotCalculator';
import { PowerCalculator } from './PowerCalculator';
import type {
  STA,
  TWTParams,
  Timeslot,
  SimulationState,
  SimulationConfig,
  NegotiationLog,
  TWTGroup,
  SavingCurvePoint,
} from '../../shared/types';

export class TWTSimulator {
  private apSimulator: AccessPointSimulator;
  private staSimulators: Map<string, STASimulator> = new Map();
  private timeslotCalculator: TimeslotCalculator;
  private powerCalculator: PowerCalculator;

  private isRunning = false;
  private currentTime = 0;
  private speed = 1;
  private duration = 10000;
  private timeslots: Timeslot[] = [];
  private negotiationLogs: NegotiationLog[] = [];
  private savingCurve: SavingCurvePoint[] = [];
  private simulationInterval: NodeJS.Timeout | null = null;
  private onUpdateCallback: ((state: SimulationState) => void) | null = null;

  private defaultTWTParams: TWTParams = {
    wakeInterval: 500,
    wakeDuration: 20,
    wakeOffset: 0,
  };

  constructor() {
    this.apSimulator = new AccessPointSimulator();
    this.timeslotCalculator = new TimeslotCalculator();
    this.powerCalculator = new PowerCalculator();
  }

  setOnUpdateCallback(callback: (state: SimulationState) => void): void {
    this.onUpdateCallback = callback;
  }

  configure(config: Partial<SimulationConfig>): void {
    if (config.duration !== undefined) {
      this.duration = config.duration;
    }
    if (config.speed !== undefined) {
      this.speed = config.speed;
    }
    if (config.defaultTWTParams !== undefined) {
      this.defaultTWTParams = { ...config.defaultTWTParams };
    }
    if (config.staCount !== undefined && config.staCount !== this.staSimulators.size) {
      this.setSTACount(config.staCount);
    }
  }

  setSTACount(count: number): void {
    const currentCount = this.staSimulators.size;

    if (count > currentCount) {
      for (let i = currentCount; i < count; i++) {
        const staSim = new STASimulator(i, this.defaultTWTParams);
        this.staSimulators.set(staSim.getSTA().id, staSim);
      }
    } else if (count < currentCount) {
      const ids = Array.from(this.staSimulators.keys()).sort();
      for (let i = count; i < ids.length; i++) {
        this.staSimulators.delete(ids[i]);
      }
    }
  }

  addSTA(customTWTParams?: Partial<TWTParams>): STA {
    const newId = this.staSimulators.size;
    const params: TWTParams = {
      ...this.defaultTWTParams,
      ...customTWTParams,
    };
    const staSim = new STASimulator(newId, params);
    this.staSimulators.set(staSim.getSTA().id, staSim);
    return staSim.getSTA();
  }

  removeSTA(staId: string): boolean {
    return this.staSimulators.delete(staId);
  }

  updateSTA(staId: string, updates: Partial<STA>): STA | null {
    const staSim = this.staSimulators.get(staId);
    if (!staSim) return null;
    staSim.updateSTA(updates);
    return staSim.getSTA();
  }

  getSTAs(): STA[] {
    return Array.from(this.staSimulators.values()).map((s) => s.getSTA());
  }

  getSTA(staId: string): STA | null {
    return this.staSimulators.get(staId)?.getSTA() || null;
  }

  async negotiateAll(): Promise<NegotiationLog[]> {
    this.negotiationLogs = [];
    this.apSimulator.resetNegotiations();
    this.savingCurve = [];

    const groups = this.apSimulator.getGroups();

    for (const group of groups) {
      const groupSTAs: STA[] = [];
      for (const staId of group.staIds) {
        const staSim = this.staSimulators.get(staId);
        if (staSim) {
          groupSTAs.push(staSim.getSTA());
        }
      }

      if (groupSTAs.length === 0) continue;

      this.negotiationLogs.push({
        timestamp: this.currentTime,
        staId: group.id,
        staName: group.name,
        type: 'broadcast',
        message: `广播TWT协商: ${group.name} (${groupSTAs.length} 个STA)`,
        params: group.twtParams,
      });

      const result = this.apSimulator.negotiateBroadcastTWT(groupSTAs, group.twtParams);

      if (!result.success) {
        this.negotiationLogs.push({
          timestamp: this.currentTime,
          staId: group.id,
          staName: group.name,
          type: 'reject',
          message: `广播TWT拒绝: ${result.reason}`,
          params: group.twtParams,
        });
        continue;
      }

      const negotiatedParams = result.params!;

      if (result.adjustments?.offsetAdjusted) {
        this.negotiationLogs.push({
          timestamp: this.currentTime,
          staId: group.id,
          staName: group.name,
          type: 'adjust',
          message: `广播时隙碰撞，调整偏移量: ${result.adjustments.originalOffset}ms → ${result.adjustments.newOffset}ms`,
          params: negotiatedParams,
        });
      }

      for (const sta of groupSTAs) {
        const staSim = this.staSimulators.get(sta.id);
        if (staSim) {
          staSim.updateSTA({
            twtMode: 'broadcast',
            groupId: group.id,
          });
          staSim.acceptTWT(negotiatedParams);
        }
      }

      this.negotiationLogs.push({
        timestamp: this.currentTime,
        staId: group.id,
        staName: group.name,
        type: 'complete',
        message: `广播TWT协商完成: ${group.name}, 偏移=${negotiatedParams.wakeOffset}ms`,
        params: negotiatedParams,
      });
    }

    const negotiatedIds = new Set<string>();
    for (const group of groups) {
      for (const staId of group.staIds) {
        negotiatedIds.add(staId);
      }
    }

    for (const staSim of this.staSimulators.values()) {
      const sta = staSim.getSTA();
      if (negotiatedIds.has(sta.id)) continue;

      const requestedParams = staSim.requestTWT();

      this.negotiationLogs.push({
        timestamp: this.currentTime,
        staId: sta.id,
        staName: sta.name,
        type: 'request',
        message: `${sta.name} 请求独立TWT协商`,
        params: requestedParams,
      });

      const result: NegotiationResult = this.apSimulator.negotiateTWT(sta, requestedParams);

      if (!result.success) {
        this.negotiationLogs.push({
          timestamp: this.currentTime,
          staId: sta.id,
          staName: sta.name,
          type: 'reject',
          message: `AP 拒绝 TWT 请求: ${result.reason}`,
          params: requestedParams,
        });

        staSim.rejectTWT();

        this.negotiationLogs.push({
          timestamp: this.currentTime,
          staId: sta.id,
          staName: sta.name,
          type: 'failed',
          message: `${sta.name} TWT 协商失败`,
          params: requestedParams,
        });
        continue;
      }

      const negotiatedParams = result.params!;

      this.negotiationLogs.push({
        timestamp: this.currentTime,
        staId: sta.id,
        staName: sta.name,
        type: 'response',
        message: `AP 响应 TWT 参数`,
        params: negotiatedParams,
      });

      if (result.adjustments?.offsetAdjusted) {
        this.negotiationLogs.push({
          timestamp: this.currentTime,
          staId: sta.id,
          staName: sta.name,
          type: 'adjust',
          message: `时隙碰撞，调整偏移量: ${result.adjustments.originalOffset}ms → ${result.adjustments.newOffset}ms`,
          params: negotiatedParams,
        });
      }

      staSim.updateSTA({ twtMode: 'individual', groupId: undefined });
      staSim.acceptTWT(negotiatedParams);

      this.negotiationLogs.push({
        timestamp: this.currentTime,
        staId: sta.id,
        staName: sta.name,
        type: 'complete',
        message: `${sta.name} TWT 协商完成`,
        params: negotiatedParams,
      });
    }

    this.generateAllTimeslots();
    return this.negotiationLogs;
  }

  private generateAllTimeslots(): void {
    this.timeslots = [];

    for (const staSim of this.staSimulators.values()) {
      const sta = staSim.getSTA();
      if (!sta.negotiatedTWT) continue;

      const wakeSlots = this.timeslotCalculator.generateSTAslots(
        sta,
        sta.negotiatedTWT,
        0,
        this.duration
      );

      const sleepSlots = this.timeslotCalculator.generateSleepSlots(
        sta,
        wakeSlots,
        0,
        this.duration
      );

      this.timeslots.push(...wakeSlots, ...sleepSlots);
    }

    this.timeslots = this.timeslotCalculator.mergeAdjacentSlots(this.timeslots);
  }

  start(): boolean {
    if (this.isRunning) return false;

    if (this.staSimulators.size === 0) {
      this.setSTACount(4);
    }

    if (this.negotiationLogs.length === 0) {
      this.negotiateAll();
    }

    this.isRunning = true;
    this.startSimulationLoop();
    return true;
  }

  pause(): boolean {
    if (!this.isRunning) return false;
    this.isRunning = false;
    this.stopSimulationLoop();
    return true;
  }

  reset(): void {
    this.isRunning = false;
    this.stopSimulationLoop();
    this.currentTime = 0;
    this.timeslots = [];
    this.negotiationLogs = [];
    this.savingCurve = [];
    this.apSimulator.clearAllocations();

    for (const staSim of this.staSimulators.values()) {
      staSim.updateSTA({
        status: 'disconnected',
        negotiated: false,
        negotiatedTWT: undefined,
        groupId: undefined,
        twtMode: 'individual',
      });
    }

    this.notifyUpdate();
  }

  private startSimulationLoop(): void {
    const tickMs = 50;
    const simulatedMsPerTick = tickMs * this.speed;

    this.simulationInterval = setInterval(() => {
      if (!this.isRunning) return;

      this.currentTime += simulatedMsPerTick;

      if (this.currentTime >= this.duration) {
        this.currentTime = this.duration;
        this.isRunning = false;
        this.stopSimulationLoop();
      }

      for (const staSim of this.staSimulators.values()) {
        staSim.updateStatus(this.currentTime);
      }

      this.notifyUpdate();
    }, tickMs);
  }

  private stopSimulationLoop(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  private notifyUpdate(): void {
    if (this.onUpdateCallback) {
      const state = this.getState();
      this.collectSavingCurvePoint(state);
      this.onUpdateCallback(state);
    }
  }

  private collectSavingCurvePoint(state: SimulationState): void {
    if (this.savingCurve.length > 0) {
      const lastPoint = this.savingCurve[this.savingCurve.length - 1];
      if (state.currentTime - lastPoint.time < Math.max(100, this.duration / 200)) {
        return;
      }
    }

    const staSavingRatios: Record<string, number> = {};
    for (const stat of state.powerStats) {
      staSavingRatios[stat.staId] = stat.savingRatio;
    }

    this.savingCurve.push({
      time: state.currentTime,
      overallSavingRatio: state.overallSavingRatio,
      totalEnergyConsumed: state.totalEnergyConsumed,
      totalEnergySaved: state.totalEnergySaved,
      staSavingRatios,
    });
  }

  getState(): SimulationState {
    const stas = this.getSTAs();
    const relevantTimeslots = this.timeslots.filter(
      (s) => s.startTime <= this.currentTime
    );

    const overallStats = this.powerCalculator.calculateOverallStats(
      stas,
      relevantTimeslots,
      this.currentTime
    );

    return {
      isRunning: this.isRunning,
      currentTime: this.currentTime,
      speed: this.speed,
      duration: this.duration,
      ap: this.apSimulator.getAccessPoint(),
      stas,
      timeslots: relevantTimeslots,
      powerStats: overallStats.powerStats,
      overallSavingRatio: overallStats.overallSavingRatio,
      totalEnergyConsumed: overallStats.totalEnergyConsumed,
      totalEnergySaved: overallStats.totalEnergySaved,
      twtGroups: this.apSimulator.getGroups(),
      savingCurve: [...this.savingCurve],
    };
  }

  getNegotiationLogs(): NegotiationLog[] {
    return [...this.negotiationLogs];
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(100, speed));
    if (this.isRunning) {
      this.stopSimulationLoop();
      this.startSimulationLoop();
    }
  }

  seekTo(time: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    for (const staSim of this.staSimulators.values()) {
      staSim.updateStatus(this.currentTime);
    }
    this.notifyUpdate();
  }

  getPowerCalculator(): PowerCalculator {
    return this.powerCalculator;
  }

  getTimeslotCalculator(): TimeslotCalculator {
    return this.timeslotCalculator;
  }

  createGroup(name: string, twtParams: TWTParams, staIds: string[]): TWTGroup {
    return this.apSimulator.createGroup(name, twtParams, staIds);
  }

  removeGroup(groupId: string): boolean {
    return this.apSimulator.removeGroup(groupId);
  }

  getGroups(): TWTGroup[] {
    return this.apSimulator.getGroups();
  }

  getSavingCurve(): SavingCurvePoint[] {
    return [...this.savingCurve];
  }

  exportSavingCurveCSV(): string {
    const stas = this.getSTAs();
    const headers = ['time_ms', 'overall_saving_ratio', 'total_energy_consumed', 'total_energy_saved'];
    for (const sta of stas) {
      headers.push(`${sta.id}_saving_ratio`);
    }
    
    const lines = [headers.join(',')];
    
    for (const point of this.savingCurve) {
      const row = [
        point.time,
        point.overallSavingRatio.toFixed(6),
        point.totalEnergyConsumed.toFixed(2),
        point.totalEnergySaved.toFixed(2),
      ];
      for (const sta of stas) {
        row.push((point.staSavingRatios[sta.id] ?? 0).toFixed(6));
      }
      lines.push(row.join(','));
    }
    
    return lines.join('\n');
  }

  exportSavingCurveJSON(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      simulationConfig: {
        duration: this.duration,
        speed: this.speed,
        staCount: this.staSimulators.size,
      },
      curve: this.savingCurve,
    }, null, 2);
  }

  destroy(): void {
    this.stopSimulationLoop();
    this.onUpdateCallback = null;
  }
}
