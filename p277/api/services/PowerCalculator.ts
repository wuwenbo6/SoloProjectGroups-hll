import type { PowerData, STA, Timeslot, PowerProfile } from '../../shared/types';

export class PowerCalculator {
  calculatePowerForSTA(
    sta: STA,
    timeslots: Timeslot[],
    currentTime: number
  ): PowerData {
    const { startTime, endTime } = this.getTimeRange(timeslots, currentTime);
    
    const powerResult = this.calculatePowerConsumption(
      sta,
      timeslots,
      startTime,
      endTime
    );

    const currentPower = this.getCurrentPower(sta, timeslots, currentTime);

    return {
      staId: sta.id,
      timestamp: currentTime,
      currentPower,
      totalEnergy: powerResult.energy,
      savedEnergy: powerResult.savedEnergy,
      savingRatio: powerResult.savingRatio,
      baselineEnergy: powerResult.baselineEnergy,
    };
  }

  private getTimeRange(
    timeslots: Timeslot[],
    currentTime: number
  ): { startTime: number; endTime: number } {
    if (timeslots.length === 0) {
      return { startTime: 0, endTime: currentTime };
    }

    const startTime = Math.min(...timeslots.map((s) => s.startTime));
    const endTime = Math.max(
      currentTime,
      ...timeslots.map((s) => s.startTime + s.duration)
    );

    return { startTime, endTime };
  }

  calculatePowerConsumption(
    sta: STA,
    timeslots: Timeslot[],
    startTime: number,
    endTime: number
  ): {
    energy: number;
    baselineEnergy: number;
    savedEnergy: number;
    savingRatio: number;
  } {
    const { awakePower, sleepPower, transitionPower } = sta.powerProfile;
    const totalDuration = endTime - startTime;

    if (totalDuration <= 0) {
      return { energy: 0, baselineEnergy: 0, savedEnergy: 0, savingRatio: 0 };
    }

    const baselineEnergy = awakePower * totalDuration;

    if (!sta.negotiated || !sta.negotiatedTWT) {
      return {
        energy: baselineEnergy,
        baselineEnergy,
        savedEnergy: 0,
        savingRatio: 0,
      };
    }

    const staSlots = timeslots
      .filter((s) => s.staId === sta.id)
      .sort((a, b) => a.startTime - b.startTime);

    let totalEnergy = 0;

    for (const slot of staSlots) {
      const slotStart = Math.max(slot.startTime, startTime);
      const slotEnd = Math.min(slot.startTime + slot.duration, endTime);
      const slotDuration = slotEnd - slotStart;

      if (slotDuration <= 0) continue;

      let power: number;
      switch (slot.type) {
        case 'wake':
          power = awakePower;
          break;
        case 'sleep':
          power = sleepPower;
          break;
        case 'transition':
          power = transitionPower;
          break;
        default:
          power = awakePower;
      }

      totalEnergy += power * slotDuration;
    }

    if (staSlots.length === 0) {
      totalEnergy = sleepPower * totalDuration;
    }

    totalEnergy = Math.max(totalEnergy, 0);

    return {
      energy: totalEnergy,
      baselineEnergy,
      savedEnergy: baselineEnergy - totalEnergy,
      savingRatio: baselineEnergy > 0 ? (baselineEnergy - totalEnergy) / baselineEnergy : 0,
    };
  }

  getCurrentPower(
    sta: STA,
    timeslots: Timeslot[],
    currentTime: number
  ): number {
    if (!sta.negotiated) {
      return sta.powerProfile.awakePower;
    }

    const currentSlot = timeslots.find(
      (s) =>
        s.staId === sta.id &&
        s.startTime <= currentTime &&
        s.startTime + s.duration > currentTime
    );

    if (!currentSlot) {
      return sta.powerProfile.sleepPower;
    }

    const { awakePower, sleepPower, transitionPower } = sta.powerProfile;

    switch (currentSlot.type) {
      case 'wake':
        return awakePower;
      case 'sleep':
        return sleepPower;
      case 'transition':
        return transitionPower;
      default:
        return awakePower;
    }
  }

  calculateSavingRatio(
    sta: STA,
    timeslots: Timeslot[],
    startTime: number,
    endTime: number
  ): number {
    const result = this.calculatePowerConsumption(
      sta,
      timeslots,
      startTime,
      endTime
    );
    return result.savingRatio;
  }

  calculateOverallStats(
    stas: STA[],
    allSlots: Timeslot[],
    currentTime: number
  ): {
    powerStats: PowerData[];
    overallSavingRatio: number;
    totalEnergyConsumed: number;
    totalEnergySaved: number;
  } {
    const powerStats: PowerData[] = [];
    let totalBaseline = 0;
    let totalEnergy = 0;
    let totalSaved = 0;

    for (const sta of stas) {
      const stat = this.calculatePowerForSTA(sta, allSlots, currentTime);
      powerStats.push(stat);
      totalBaseline += stat.baselineEnergy;
      totalEnergy += stat.totalEnergy;
      totalSaved += stat.savedEnergy;
    }

    const overallSavingRatio = totalBaseline > 0 ? totalSaved / totalBaseline : 0;

    return {
      powerStats,
      overallSavingRatio,
      totalEnergyConsumed: totalEnergy,
      totalEnergySaved: totalSaved,
    };
  }

  getPowerBreakdown(
    sta: STA,
    timeslots: Timeslot[],
    startTime: number,
    endTime: number
  ): {
    wakeTime: number;
    sleepTime: number;
    transitionTime: number;
    wakeEnergy: number;
    sleepEnergy: number;
    transitionEnergy: number;
  } {
    const staSlots = timeslots.filter(
      (s) =>
        s.staId === sta.id &&
        s.startTime < endTime &&
        s.startTime + s.duration > startTime
    );

    let wakeTime = 0;
    let sleepTime = 0;
    let transitionTime = 0;

    for (const slot of staSlots) {
      const slotStart = Math.max(slot.startTime, startTime);
      const slotEnd = Math.min(slot.startTime + slot.duration, endTime);
      const duration = slotEnd - slotStart;

      if (duration <= 0) continue;

      switch (slot.type) {
        case 'wake':
          wakeTime += duration;
          break;
        case 'sleep':
          sleepTime += duration;
          break;
        case 'transition':
          transitionTime += duration;
          break;
      }
    }

    const { awakePower, sleepPower, transitionPower } = sta.powerProfile;

    return {
      wakeTime,
      sleepTime,
      transitionTime,
      wakeEnergy: wakeTime * awakePower,
      sleepEnergy: sleepTime * sleepPower,
      transitionEnergy: transitionTime * transitionPower,
    };
  }

  calculateEnergyPerHour(
    sta: STA,
    timeslots: Timeslot[]
  ): {
    currentRate: number;
    baselineRate: number;
    savingsRate: number;
  } {
    const { awakePower, sleepPower, transitionPower } = sta.powerProfile;

    if (!sta.negotiated || !sta.negotiatedTWT) {
      return {
        currentRate: awakePower,
        baselineRate: awakePower,
        savingsRate: 0,
      };
    }

    const { wakeInterval, wakeDuration } = sta.negotiatedTWT;

    const wakeTimePerCycle = wakeDuration;
    const sleepTimePerCycle = wakeInterval - wakeDuration - 2;
    const transitionTimePerCycle = 2;

    const energyPerCycle =
      awakePower * wakeTimePerCycle +
      sleepPower * sleepTimePerCycle +
      transitionPower * transitionTimePerCycle;

    const avgPower = energyPerCycle / wakeInterval;

    return {
      currentRate: avgPower,
      baselineRate: awakePower,
      savingsRate: awakePower - avgPower,
    };
  }

  static convertToMilliwattHours(energyMs: number): number {
    return energyMs / 3600000;
  }

  static convertToWattHours(energyMs: number): number {
    return energyMs / 3600000000;
  }

  formatEnergy(energyMs: number): string {
    const wh = PowerCalculator.convertToWattHours(energyMs);
    if (wh >= 1) {
      return `${wh.toFixed(2)} Wh`;
    }
    const mwh = PowerCalculator.convertToMilliwattHours(energyMs);
    return `${mwh.toFixed(2)} mWh`;
  }

  formatPower(powerMw: number): string {
    if (powerMw >= 1000) {
      return `${(powerMw / 1000).toFixed(2)} W`;
    }
    return `${powerMw.toFixed(2)} mW`;
  }
}
