import { RBAllocation, SimulationConfig, MimoLayer } from '@shared/types';
import { ChannelService } from './ChannelService';
import { ThroughputService } from './ThroughputService';
import { PowerSaveService } from './PowerSaveService';

interface UserState {
  id: number;
  avgThroughput: number;
  slotCount: number;
}

interface MimoPair {
  primaryUser: number;
  secondaryUser: number;
  orthogonality: number;
  combinedThroughput: number;
}

export class SchedulerService {
  private userStates: Map<number, UserState> = new Map();
  private roundRobinIndex = 0;
  private powerSaveService: PowerSaveService;

  constructor(private config: SimulationConfig) {
    for (let i = 0; i < config.numUsers; i++) {
      this.userStates.set(i, {
        id: i,
        avgThroughput: 0,
        slotCount: 0,
      });
    }
    ChannelService.initUserPositions(config.numUsers, config.numBSS || 1);
    this.powerSaveService = new PowerSaveService();
    this.powerSaveService.init(config.numUsers, config.psmDutyCycle || 0.5);
  }

  schedule(
    slotIndex: number,
    algorithm: 'fair' | 'maxThroughput' | 'roundRobin'
  ): RBAllocation[] {
    ChannelService.updateUserPositions();

    if (this.config.enablePowerSave) {
      this.powerSaveService.updateStates(slotIndex);
    }

    const userSNRs = new Map<number, number>();
    for (let i = 0; i < this.config.numUsers; i++) {
      const isActive = !this.config.enablePowerSave || this.powerSaveService.isUserActive(i);
      const snr = ChannelService.generateSNR(i, slotIndex, this.config);
      userSNRs.set(i, isActive ? snr : -100);
    }

    if (this.config.mimoMode === 'MU' && this.config.maxMimoLayers >= 2) {
      return this.muMimoSchedule(userSNRs, algorithm);
    }

    switch (algorithm) {
      case 'maxThroughput':
        return this.maxThroughputSchedule(userSNRs);
      case 'fair':
        return this.proportionalFairSchedule(userSNRs);
      case 'roundRobin':
        return this.roundRobinSchedule(userSNRs);
      default:
        return this.maxThroughputSchedule(userSNRs);
    }
  }

  private muMimoSchedule(
    userSNRs: Map<number, number>,
    algorithm: 'fair' | 'maxThroughput' | 'roundRobin'
  ): RBAllocation[] {
    const allocations: RBAllocation[] = [];
    const userPriorities = new Map<number, number>();

    for (let i = 0; i < this.config.numUsers; i++) {
      const snr = userSNRs.get(i) || 0;
      const mcs = ChannelService.snrToMCS(snr);
      const throughput = ThroughputService.calculateThroughput(snr, mcs);

      if (algorithm === 'fair') {
        const state = this.userStates.get(i)!;
        const avgThroughput = state.avgThroughput || 0.001;
        userPriorities.set(i, throughput / avgThroughput);
      } else {
        userPriorities.set(i, throughput);
      }
    }

    const sortedUsers = Array.from({ length: this.config.numUsers })
      .map((_, i) => i)
      .sort((a, b) => (userPriorities.get(b) || 0) - (userPriorities.get(a) || 0));

    const assignedUsers = new Set<number>();

    for (let rbIndex = 0; rbIndex < this.config.numRBs; rbIndex++) {
      let primaryUser = -1;
      for (const user of sortedUsers) {
        if (!assignedUsers.has(user) || algorithm === 'fair') {
          primaryUser = user;
          break;
        }
      }

      if (primaryUser === -1) {
        primaryUser = sortedUsers[0];
      }

      const primarySNR = userSNRs.get(primaryUser) || 0;
      const primaryMCS = ChannelService.snrToMCS(primarySNR);
      const primaryThroughput = ThroughputService.calculateThroughput(primarySNR, primaryMCS);
      const primaryBSS = ChannelService.getUserBSS(primaryUser);
      const primaryColor = primaryBSS?.color || 0;

      const mimoLayers: MimoLayer[] = [{
        userId: primaryUser,
        snr: primarySNR,
        mcs: primaryMCS,
        throughput: primaryThroughput,
        channelQuality: 1.0,
      }];

      const candidateUsers = sortedUsers.filter(u => u !== primaryUser);
      let pairedUser = ChannelService.findBestMimoPair(primaryUser, candidateUsers, 0.25);

      let isSRAllowed = false;
      if (pairedUser !== null && this.config.enableBSSColoring) {
        isSRAllowed = ChannelService.checkSpatialReuse(primaryUser, pairedUser);
      }

      if (pairedUser !== null) {
        const pairedSNR = userSNRs.get(pairedUser) || 0;
        const orthogonality = ChannelService.calculateChannelOrthogonality(primaryUser, pairedUser);

        const interferenceFactor = isSRAllowed ? 1 - orthogonality * 0.3 : 1 - orthogonality * 0.5;
        const effectiveSNR = pairedSNR - (1 - orthogonality) * 3;

        const pairedMCS = ChannelService.snrToMCS(Math.max(0, effectiveSNR));
        const pairedThroughput = ThroughputService.calculateThroughput(effectiveSNR, pairedMCS) * interferenceFactor;

        mimoLayers.push({
          userId: pairedUser,
          snr: effectiveSNR,
          mcs: pairedMCS,
          throughput: pairedThroughput,
          channelQuality: orthogonality,
        });
      }

      const totalThroughput = mimoLayers.reduce((sum, l) => sum + l.throughput, 0);

      allocations.push({
        rbIndex,
        userId: primaryUser,
        snr: primarySNR,
        mcs: primaryMCS,
        throughput: totalThroughput,
        isMumo: mimoLayers.length > 1,
        mimoLayers,
        bssId: primaryBSS?.bssId || 0,
        bssColor: primaryColor,
        isSRAllowed,
      });

      if (algorithm !== 'fair') {
        mimoLayers.forEach(l => assignedUsers.add(l.userId));
      }
    }

    if (algorithm === 'fair') {
      this.updateFairnessStats(allocations);
    }

    return allocations;
  }

  private updateFairnessStats(allocations: RBAllocation[]): void {
    const userThroughputs = new Map<number, number>();

    for (const alloc of allocations) {
      if (alloc.mimoLayers) {
        for (const layer of alloc.mimoLayers) {
          const current = userThroughputs.get(layer.userId) || 0;
          userThroughputs.set(layer.userId, current + layer.throughput);
        }
      } else {
        const current = userThroughputs.get(alloc.userId) || 0;
        userThroughputs.set(alloc.userId, current + alloc.throughput);
      }
    }

    for (let i = 0; i < this.config.numUsers; i++) {
      const state = this.userStates.get(i)!;
      const slotThroughput = userThroughputs.get(i) || 0;

      state.avgThroughput =
        (state.avgThroughput * state.slotCount + slotThroughput) /
        (state.slotCount + 1);
      state.slotCount++;
    }
  }

  private maxThroughputSchedule(
    userSNRs: Map<number, number>
  ): RBAllocation[] {
    const allocations: RBAllocation[] = [];

    for (let rbIndex = 0; rbIndex < this.config.numRBs; rbIndex++) {
      let maxSNR = -Infinity;
      let bestUserId = 0;

      for (let i = 0; i < this.config.numUsers; i++) {
        const snr = userSNRs.get(i) || 0;
        if (snr > maxSNR) {
          maxSNR = snr;
          bestUserId = i;
        }
      }

      const mcs = ChannelService.snrToMCS(maxSNR);
      const throughput = ThroughputService.calculateThroughput(maxSNR, mcs);
      const bss = ChannelService.getUserBSS(bestUserId);

      allocations.push({
        rbIndex,
        userId: bestUserId,
        snr: maxSNR,
        mcs,
        throughput,
        isMumo: false,
        bssId: bss?.bssId || 0,
        bssColor: bss?.color || 0,
        isSRAllowed: false,
      });
    }

    return allocations;
  }

  private proportionalFairSchedule(
    userSNRs: Map<number, number>
  ): RBAllocation[] {
    const allocations: RBAllocation[] = [];
    const userThroughputs = new Map<number, number[]>();

    for (let rbIndex = 0; rbIndex < this.config.numRBs; rbIndex++) {
      let maxPriority = -Infinity;
      let bestUserId = 0;
      let bestSNR = 0;

      for (let i = 0; i < this.config.numUsers; i++) {
        const snr = userSNRs.get(i) || 0;
        const mcs = ChannelService.snrToMCS(snr);
        const instantThroughput = ThroughputService.calculateThroughput(snr, mcs);

        const state = this.userStates.get(i)!;
        const avgThroughput = state.avgThroughput || 0.001;
        const priority = instantThroughput / avgThroughput;

        if (priority > maxPriority) {
          maxPriority = priority;
          bestUserId = i;
          bestSNR = snr;
        }
      }

      const mcs = ChannelService.snrToMCS(bestSNR);
      const throughput = ThroughputService.calculateThroughput(bestSNR, mcs);
      const bss = ChannelService.getUserBSS(bestUserId);

      if (!userThroughputs.has(bestUserId)) {
        userThroughputs.set(bestUserId, []);
      }
      userThroughputs.get(bestUserId)!.push(throughput);

      allocations.push({
        rbIndex,
        userId: bestUserId,
        snr: bestSNR,
        mcs,
        throughput,
        isMumo: false,
        bssId: bss?.bssId || 0,
        bssColor: bss?.color || 0,
        isSRAllowed: false,
      });
    }

    for (let i = 0; i < this.config.numUsers; i++) {
      const state = this.userStates.get(i)!;
      const rbThroughputs = userThroughputs.get(i) || [];
      const slotThroughput = rbThroughputs.reduce((a, b) => a + b, 0);

      state.avgThroughput =
        (state.avgThroughput * state.slotCount + slotThroughput) /
        (state.slotCount + 1);
      state.slotCount++;
    }

    return allocations;
  }

  private roundRobinSchedule(
    userSNRs: Map<number, number>
  ): RBAllocation[] {
    const allocations: RBAllocation[] = [];

    for (let rbIndex = 0; rbIndex < this.config.numRBs; rbIndex++) {
      const userId = (this.roundRobinIndex + rbIndex) % this.config.numUsers;
      const snr = userSNRs.get(userId) || 0;
      const mcs = ChannelService.snrToMCS(snr);
      const throughput = ThroughputService.calculateThroughput(snr, mcs);
      const bss = ChannelService.getUserBSS(userId);

      allocations.push({
        rbIndex,
        userId,
        snr,
        mcs,
        throughput,
        isMumo: false,
        bssId: bss?.bssId || 0,
        bssColor: bss?.color || 0,
        isSRAllowed: false,
      });
    }

    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.config.numUsers;

    return allocations;
  }

  getPowerState(userId: number): 'active' | 'sleep' | 'doze' {
    return this.powerSaveService.getPowerState(userId);
  }

  getPowerSaveStats(currentSlot: number) {
    return this.powerSaveService.calculateEnergySavings(currentSlot);
  }

  reset(): void {
    for (let i = 0; i < this.config.numUsers; i++) {
      this.userStates.set(i, {
        id: i,
        avgThroughput: 0,
        slotCount: 0,
      });
    }
    this.roundRobinIndex = 0;
    ChannelService.reset();
    this.powerSaveService.reset();
  }
}
