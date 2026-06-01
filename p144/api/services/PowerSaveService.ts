import { PowerSaveState } from '@shared/types';

export class PowerSaveService {
  private powerStates: Map<number, PowerSaveState> = new Map();
  private dutyCycle: number = 0.5;

  init(numUsers: number, dutyCycle: number = 0.5): void {
    this.dutyCycle = dutyCycle;
    this.powerStates.clear();

    for (let i = 0; i < numUsers; i++) {
      const sleepInterval = Math.max(1, Math.floor(1 / dutyCycle));
      this.powerStates.set(i, {
        userId: i,
        isActive: true,
        wakeUpSlot: 0,
        sleepInterval,
        bufferedPackets: 0,
      });
    }
  }

  updateStates(currentSlot: number): void {
    this.powerStates.forEach((state) => {
      const isWakeSlot = currentSlot % state.sleepInterval === 0;

      if (isWakeSlot) {
        state.isActive = true;
        state.wakeUpSlot = currentSlot;
        state.bufferedPackets = Math.max(0, state.bufferedPackets - 2);
      } else if (state.isActive) {
        const activeDuration = currentSlot - state.wakeUpSlot;
        if (activeDuration >= 2) {
          state.isActive = false;
          state.bufferedPackets += 1;
        }
      } else {
        state.bufferedPackets += 1;
      }
    });
  }

  isUserActive(userId: number): boolean {
    const state = this.powerStates.get(userId);
    return state?.isActive ?? true;
  }

  getPowerState(userId: number): 'active' | 'sleep' | 'doze' {
    const state = this.powerStates.get(userId);
    if (!state || state.isActive) return 'active';
    if (state.bufferedPackets > 5) return 'sleep';
    return 'doze';
  }

  getBufferedPackets(userId: number): number {
    return this.powerStates.get(userId)?.bufferedPackets ?? 0;
  }

  calculateEnergySavings(currentSlot: number): {
    totalSleepSlots: number;
    avgSleepRatio: number;
    energySaved: number;
  } {
    let totalSleepSlots = 0;

    this.powerStates.forEach((state) => {
      if (!state.isActive) totalSleepSlots++;
    });

    const totalUserSlots = currentSlot * this.powerStates.size;
    const avgSleepRatio = totalUserSlots > 0
      ? (totalSleepSlots * this.dutyCycle) / totalUserSlots
      : 0;

    const energySaved = avgSleepRatio * 100;

    return {
      totalSleepSlots,
      avgSleepRatio,
      energySaved,
    };
  }

  reset(): void {
    this.powerStates.clear();
  }
}
