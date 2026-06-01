import type { STA, TWTParams, PowerProfile } from '../../shared/types';

const STA_COLORS = [
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
];

function generateMAC(): string {
  const hex = '0123456789ABCDEF';
  let mac = '';
  for (let i = 0; i < 6; i++) {
    if (i > 0) mac += ':';
    for (let j = 0; j < 2; j++) {
      mac += hex[Math.floor(Math.random() * 16)];
    }
  }
  return mac;
}

export class STASimulator {
  private sta: STA;

  constructor(
    id: number,
    defaultTWTParams: TWTParams,
    customPowerProfile?: Partial<PowerProfile>
  ) {
    const powerProfile: PowerProfile = {
      awakePower: 150 + Math.random() * 50,
      sleepPower: 0.5 + Math.random() * 0.5,
      transitionPower: 100 + Math.random() * 50,
      ...customPowerProfile,
    };

    this.sta = {
      id: `sta-${String(id).padStart(3, '0')}`,
      name: `STA-${String(id).padStart(2, '0')}`,
      macAddress: generateMAC(),
      twtParams: {
        wakeInterval: defaultTWTParams.wakeInterval + Math.floor(Math.random() * 100) - 50,
        wakeDuration: defaultTWTParams.wakeDuration + Math.floor(Math.random() * 4) - 2,
        wakeOffset: defaultTWTParams.wakeOffset + Math.floor(Math.random() * 20),
      },
      powerProfile,
      status: 'disconnected',
      negotiated: false,
      color: STA_COLORS[id % STA_COLORS.length],
      groupId: undefined,
      twtMode: 'individual',
    };
  }

  getSTA(): STA {
    return { ...this.sta };
  }

  updateSTA(updates: Partial<STA>): void {
    this.sta = { ...this.sta, ...updates };
  }

  requestTWT(): TWTParams {
    this.sta.status = 'negotiating';
    return { ...this.sta.twtParams };
  }

  acceptTWT(params: TWTParams): void {
    this.sta.negotiatedTWT = { ...params };
    this.sta.negotiated = true;
    this.sta.status = 'sleeping';
  }

  rejectTWT(): void {
    this.sta.status = 'disconnected';
    this.sta.negotiated = false;
    this.sta.negotiatedTWT = undefined;
  }

  updateStatus(time: number): STA['status'] {
    if (!this.sta.negotiated || !this.sta.negotiatedTWT) {
      this.sta.status = 'disconnected';
      return 'disconnected';
    }

    const { wakeInterval, wakeDuration, wakeOffset } = this.sta.negotiatedTWT;
    const cyclePos = (time - wakeOffset) % wakeInterval;

    if (cyclePos < 0) {
      this.sta.status = 'sleeping';
      return 'sleeping';
    }

    if (cyclePos < 1) {
      this.sta.status = 'transition';
    } else if (cyclePos < wakeDuration) {
      this.sta.status = 'awake';
    } else if (cyclePos < wakeDuration + 1) {
      this.sta.status = 'transition';
    } else {
      this.sta.status = 'sleeping';
    }

    return this.sta.status;
  }

  getCurrentPower(time: number): number {
    const status = this.updateStatus(time);
    const { awakePower, sleepPower, transitionPower } = this.sta.powerProfile;

    switch (status) {
      case 'awake':
        return awakePower;
      case 'sleeping':
        return sleepPower;
      case 'transition':
        return transitionPower;
      default:
        return awakePower;
    }
  }

  calculatePowerConsumption(
    startTime: number,
    endTime: number
  ): { energy: number; baselineEnergy: number; savedEnergy: number; savingRatio: number } {
    if (!this.sta.negotiated || !this.sta.negotiatedTWT) {
      const baseline = this.sta.powerProfile.awakePower * (endTime - startTime);
      return {
        energy: baseline,
        baselineEnergy: baseline,
        savedEnergy: 0,
        savingRatio: 0,
      };
    }

    const { wakeInterval, wakeDuration, wakeOffset } = this.sta.negotiatedTWT;
    const { awakePower, sleepPower, transitionPower } = this.sta.powerProfile;

    const totalDuration = endTime - startTime;
    const baselineEnergy = awakePower * totalDuration;

    const completeCycles = Math.floor((totalDuration - wakeOffset) / wakeInterval);
    const remainingTime = (totalDuration - wakeOffset) % wakeInterval;

    const wakeTimePerCycle = wakeDuration;
    const sleepTimePerCycle = wakeInterval - wakeDuration - 2;
    const transitionTimePerCycle = 2;

    const energyPerCycle =
      awakePower * wakeTimePerCycle +
      sleepPower * sleepTimePerCycle +
      transitionPower * transitionTimePerCycle;

    let totalEnergy = completeCycles * energyPerCycle;

    if (remainingTime > 0) {
      if (remainingTime < 1) {
        totalEnergy += transitionPower * remainingTime;
      } else if (remainingTime < wakeDuration) {
        totalEnergy += transitionPower * 1 + awakePower * (remainingTime - 1);
      } else if (remainingTime < wakeDuration + 1) {
        totalEnergy +=
          transitionPower * 1 + awakePower * (wakeDuration - 1) + transitionPower * (remainingTime - wakeDuration);
      } else {
        totalEnergy +=
          transitionPower * 2 +
          awakePower * (wakeDuration - 1) +
          sleepPower * (remainingTime - wakeDuration - 1);
      }
    }

    if (wakeOffset > 0) {
      totalEnergy += sleepPower * wakeOffset;
    }

    totalEnergy = Math.max(totalEnergy, 0);

    return {
      energy: totalEnergy,
      baselineEnergy,
      savedEnergy: baselineEnergy - totalEnergy,
      savingRatio: baselineEnergy > 0 ? (baselineEnergy - totalEnergy) / baselineEnergy : 0,
    };
  }
}
