import {
  SimulationConfig,
  SlotResult,
  SimulationResult,
  SimulationReport,
  USER_COLORS,
  getUserName,
  getBSSName,
  BSS_COLORS,
} from '@shared/types';
import { SchedulerService } from '../services/SchedulerService';
import { ThroughputService } from '../services/ThroughputService';
import { ChannelService } from '../services/ChannelService';

export class SimulationController {
  private config: SimulationConfig | null = null;
  private scheduler: SchedulerService | null = null;
  private currentSlot = 0;
  private slotResults: SlotResult[] = [];
  private isRunning = false;

  init(config: SimulationConfig): void {
    this.config = config;
    this.scheduler = new SchedulerService(config);
    this.currentSlot = 0;
    this.slotResults = [];
    this.isRunning = false;
  }

  step(): SlotResult | null {
    if (!this.config || !this.scheduler) {
      return null;
    }

    const allocations = this.scheduler.schedule(
      this.currentSlot,
      this.config.algorithm
    );

    const userStatsMap = new Map<
      number,
      { throughput: number; allocatedRB: number; powerState: 'active' | 'sleep' | 'doze' }
    >();
    for (let i = 0; i < this.config.numUsers; i++) {
      userStatsMap.set(i, {
        throughput: 0,
        allocatedRB: 0,
        powerState: this.config.enablePowerSave ? this.scheduler.getPowerState(i) : 'active',
      });
    }

    for (const alloc of allocations) {
      if (alloc.mimoLayers && alloc.mimoLayers.length > 0) {
        for (const layer of alloc.mimoLayers) {
          const stats = userStatsMap.get(layer.userId)!;
          stats.throughput += layer.throughput;
          stats.allocatedRB++;
        }
      } else {
        const stats = userStatsMap.get(alloc.userId)!;
        stats.throughput += alloc.throughput;
        stats.allocatedRB++;
      }
    }

    const userStats = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
      userId,
      throughput: stats.throughput,
      allocatedRB: stats.allocatedRB,
      powerState: stats.powerState,
    }));

    const totalThroughput = allocations.reduce((sum, a) => sum + a.throughput, 0);
    const fairnessIndex = ThroughputService.calculateJainFairnessIndex(
      userStats.map((s) => s.throughput)
    );

    const bssStats = this.calculateBSSStats(allocations);

    const result: SlotResult = {
      slotIndex: this.currentSlot,
      allocations,
      userStats,
      totalThroughput,
      fairnessIndex,
      algorithm: this.config.algorithm,
      bssStats,
    };

    this.slotResults.push(result);
    this.currentSlot++;

    return result;
  }

  private calculateBSSStats(allocations: any[]) {
    if (!this.config?.enableBSSColoring) {
      return [];
    }

    const bssMap = new Map<number, { throughput: number; activeUsers: Set<number>; srThroughput: number }>();

    for (const alloc of allocations) {
      const bssId = alloc.bssId || 0;
      if (!bssMap.has(bssId)) {
        bssMap.set(bssId, {
          throughput: 0,
          activeUsers: new Set(),
          srThroughput: 0,
        });
      }

      const bss = bssMap.get(bssId)!;
      bss.throughput += alloc.throughput;
      bss.activeUsers.add(alloc.userId);

      if (alloc.isSRAllowed && alloc.mimoLayers?.length > 1) {
        bss.srThroughput += alloc.throughput;
      }
    }

    return Array.from(bssMap.entries()).map(([bssId, stats]) => ({
      bssId,
      color: ChannelService.getBSSColor(bssId),
      throughput: stats.throughput,
      activeUsers: stats.activeUsers.size,
      srThroughput: stats.srThroughput,
    }));
  }

  run(numSlots?: number): SimulationResult | null {
    if (!this.config) return null;

    this.isRunning = true;
    const slotsToRun = numSlots || this.config.numSlots - this.currentSlot;

    for (let i = 0; i < slotsToRun && this.currentSlot < this.config.numSlots; i++) {
      this.step();
    }

    this.isRunning = false;
    return this.getResult();
  }

  reset(): void {
    if (this.config && this.scheduler) {
      this.scheduler.reset();
      this.currentSlot = 0;
      this.slotResults = [];
      this.isRunning = false;
    }
  }

  getResult(): SimulationResult | null {
    if (!this.config) return null;

    const userTotals = new Map<number, { total: number; count: number }>();
    for (let i = 0; i < this.config.numUsers; i++) {
      userTotals.set(i, { total: 0, count: 0 });
    }

    for (const slot of this.slotResults) {
      for (const stat of slot.userStats) {
        const t = userTotals.get(stat.userId)!;
        t.total += stat.throughput;
        t.count++;
      }
    }

    const totalThroughput = this.slotResults.reduce(
      (sum, s) => sum + s.totalThroughput,
      0
    );
    const avgThroughput =
      this.slotResults.length > 0
        ? totalThroughput / this.slotResults.length
        : 0;

    const userThroughputs = Array.from(userTotals.entries()).map(
      ([userId, t]) => ({
        userId,
        total: t.total,
        avg: t.count > 0 ? t.total / t.count : 0,
        color: USER_COLORS[userId % USER_COLORS.length],
        name: getUserName(userId),
      })
    );

    const avgFairness =
      this.slotResults.length > 0
        ? this.slotResults.reduce((sum, s) => sum + s.fairnessIndex, 0) /
          this.slotResults.length
        : 0;

    const powerSaveStats = this.config.enablePowerSave && this.scheduler
      ? this.scheduler.getPowerSaveStats(this.currentSlot)
      : { totalSleepSlots: 0, avgSleepRatio: 0, energySaved: 0 };

    const bssSummary = this.config.enableBSSColoring
      ? this.calculateBSSSummary()
      : [];

    return {
      config: this.config,
      currentSlot: this.currentSlot,
      isRunning: this.isRunning,
      slotResults: this.slotResults,
      summary: {
        totalThroughput,
        avgThroughput,
        userThroughputs,
        fairnessIndex: avgFairness,
        powerSaveStats,
        bssSummary,
      },
    };
  }

  private calculateBSSummary() {
    if (!this.config?.enableBSSColoring || this.slotResults.length === 0) {
      return [];
    }

    const bssMap = new Map<number, { totalThroughput: number; srThroughput: number }>();

    for (const slot of this.slotResults) {
      for (const bss of slot.bssStats) {
        if (!bssMap.has(bss.bssId)) {
          bssMap.set(bss.bssId, { totalThroughput: 0, srThroughput: 0 });
        }
        const stats = bssMap.get(bss.bssId)!;
        stats.totalThroughput += bss.throughput;
        stats.srThroughput += bss.srThroughput;
      }
    }

    const interferenceReduction = ChannelService.calculateInterferenceReduction();

    return Array.from(bssMap.entries()).map(([bssId, stats]) => ({
      bssId,
      color: ChannelService.getBSSColor(bssId),
      totalThroughput: stats.totalThroughput,
      srThroughput: stats.srThroughput,
      interferenceReduction,
    }));
  }

  compareAlgorithms(
    config: SimulationConfig,
    alg1: 'fair' | 'maxThroughput' | 'roundRobin',
    alg2: 'fair' | 'maxThroughput' | 'roundRobin'
  ): SimulationResult {
    const config1 = { ...config, algorithm: alg1 };
    const scheduler1 = new SchedulerService(config1);
    const results1: SlotResult[] = [];

    for (let i = 0; i < config.numSlots; i++) {
      const allocations = scheduler1.schedule(i, alg1);
      const userStatsMap = new Map<number, { throughput: number; allocatedRB: number; powerState: 'active' | 'sleep' | 'doze' }>();
      for (let j = 0; j < config.numUsers; j++) {
        userStatsMap.set(j, {
          throughput: 0,
          allocatedRB: 0,
          powerState: config.enablePowerSave ? scheduler1.getPowerState(j) : 'active',
        });
      }

      for (const alloc of allocations) {
        if (alloc.mimoLayers) {
          for (const layer of alloc.mimoLayers) {
            const stats = userStatsMap.get(layer.userId)!;
            stats.throughput += layer.throughput;
            stats.allocatedRB++;
          }
        } else {
          const stats = userStatsMap.get(alloc.userId)!;
          stats.throughput += alloc.throughput;
          stats.allocatedRB++;
        }
      }

      const userStats = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
        userId,
        throughput: stats.throughput,
        allocatedRB: stats.allocatedRB,
        powerState: stats.powerState,
      }));

      results1.push({
        slotIndex: i,
        allocations,
        userStats,
        totalThroughput: allocations.reduce((sum, a) => sum + a.throughput, 0),
        fairnessIndex: ThroughputService.calculateJainFairnessIndex(
          userStats.map((s) => s.throughput)
        ),
        algorithm: alg1,
        bssStats: [],
      });
    }

    const config2 = { ...config, algorithm: alg2 };
    const scheduler2 = new SchedulerService(config2);
    const results2: SlotResult[] = [];

    for (let i = 0; i < config.numSlots; i++) {
      const allocations = scheduler2.schedule(i, alg2);
      const userStatsMap = new Map<number, { throughput: number; allocatedRB: number; powerState: 'active' | 'sleep' | 'doze' }>();
      for (let j = 0; j < config.numUsers; j++) {
        userStatsMap.set(j, {
          throughput: 0,
          allocatedRB: 0,
          powerState: config.enablePowerSave ? scheduler2.getPowerState(j) : 'active',
        });
      }

      for (const alloc of allocations) {
        if (alloc.mimoLayers) {
          for (const layer of alloc.mimoLayers) {
            const stats = userStatsMap.get(layer.userId)!;
            stats.throughput += layer.throughput;
            stats.allocatedRB++;
          }
        } else {
          const stats = userStatsMap.get(alloc.userId)!;
          stats.throughput += alloc.throughput;
          stats.allocatedRB++;
        }
      }

      const userStats = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
        userId,
        throughput: stats.throughput,
        allocatedRB: stats.allocatedRB,
        powerState: stats.powerState,
      }));

      results2.push({
        slotIndex: i,
        allocations,
        userStats,
        totalThroughput: allocations.reduce((sum, a) => sum + a.throughput, 0),
        fairnessIndex: ThroughputService.calculateJainFairnessIndex(
          userStats.map((s) => s.throughput)
        ),
        algorithm: alg2,
        bssStats: [],
      });
    }

    const summary1 = this.calculateSummary(results1, config);
    const summary2 = this.calculateSummary(results2, config);

    return {
      config,
      currentSlot: config.numSlots,
      isRunning: false,
      slotResults: results1,
      summary: summary1,
      compareResult: {
        algorithm1: { name: alg1, summary: summary1 },
        algorithm2: { name: alg2, summary: summary2 },
      },
    };
  }

  generateReport(format: 'json' | 'csv' = 'json'): SimulationReport | string | null {
    const result = this.getResult();
    if (!result) return null;

    const report: SimulationReport = {
      timestamp: new Date().toISOString(),
      config: result.config,
      summary: result.summary,
      slotResults: result.slotResults,
      exportFormat: format,
    };

    if (format === 'csv') {
      return this.generateCSV(report);
    }

    return report;
  }

  private generateCSV(report: SimulationReport): string {
    const headers = [
      'Slot',
      'User',
      'User_Name',
      'BSS',
      'BSS_Color',
      'Throughput',
      'Allocated_RBs',
      'Power_State',
      'MIMO_Mode',
      'SR_Allowed',
    ];

    const rows = [headers.join(',')];

    for (const slot of report.slotResults) {
      for (const stat of slot.userStats) {
        const allocation = slot.allocations.find(a => a.userId === stat.userId);
        rows.push([
          slot.slotIndex,
          stat.userId,
          getUserName(stat.userId),
          allocation?.bssId || 0,
          allocation?.bssColor || 0,
          stat.throughput.toFixed(2),
          stat.allocatedRB,
          stat.powerState,
          allocation?.isMumo ? 'MU-MIMO' : 'SU-MIMO',
          allocation?.isSRAllowed ? 'Yes' : 'No',
        ].join(','));
      }
    }

    return rows.join('\n');
  }

  private calculateSummary(
    results: SlotResult[],
    config: SimulationConfig
  ): SimulationResult['summary'] {
    const userTotals = new Map<number, { total: number; count: number }>();
    for (let i = 0; i < config.numUsers; i++) {
      userTotals.set(i, { total: 0, count: 0 });
    }

    for (const slot of results) {
      for (const stat of slot.userStats) {
        const t = userTotals.get(stat.userId)!;
        t.total += stat.throughput;
        t.count++;
      }
    }

    const totalThroughput = results.reduce((sum, s) => sum + s.totalThroughput, 0);
    const avgThroughput = results.length > 0 ? totalThroughput / results.length : 0;

    const userThroughputs = Array.from(userTotals.entries()).map(([userId, t]) => ({
      userId,
      total: t.total,
      avg: t.count > 0 ? t.total / t.count : 0,
      color: USER_COLORS[userId % USER_COLORS.length],
      name: getUserName(userId),
    }));

    const avgFairness =
      results.length > 0
        ? results.reduce((sum, s) => sum + s.fairnessIndex, 0) / results.length
        : 0;

    return {
      totalThroughput,
      avgThroughput,
      userThroughputs,
      fairnessIndex: avgFairness,
      powerSaveStats: {
        totalSleepSlots: 0,
        avgSleepRatio: 0,
        energySaved: 0,
      },
      bssSummary: [],
    };
  }

  getCurrentSlot(): number {
    return this.currentSlot;
  }

  getConfig(): SimulationConfig | null {
    return this.config;
  }
}
