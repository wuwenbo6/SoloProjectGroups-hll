import type { Timeslot, STA, TWTParams } from '../../shared/types';

export class TimeslotCalculator {
  generateSTAslots(
    sta: STA,
    params: TWTParams,
    startTime: number,
    endTime: number
  ): Timeslot[] {
    const slots: Timeslot[] = [];
    const { wakeInterval, wakeDuration, wakeOffset } = params;

    if (wakeInterval <= 0 || wakeDuration <= 0) {
      return slots;
    }

    for (let t = startTime + wakeOffset; t < endTime; t += wakeInterval) {
      slots.push({
        staId: sta.id,
        startTime: Math.max(startTime, t - 1),
        duration: 1,
        type: 'transition',
      });

      slots.push({
        staId: sta.id,
        startTime: t,
        duration: Math.min(wakeDuration, endTime - t),
        type: 'wake',
      });

      if (t + wakeDuration < endTime) {
        slots.push({
          staId: sta.id,
          startTime: t + wakeDuration,
          duration: 1,
          type: 'transition',
        });
      }
    }

    return slots;
  }

  generateSleepSlots(
    sta: STA,
    wakeSlots: Timeslot[],
    startTime: number,
    endTime: number
  ): Timeslot[] {
    const sleepSlots: Timeslot[] = [];
    const sortedWakeSlots = [...wakeSlots]
      .filter((s) => s.type === 'wake')
      .sort((a, b) => a.startTime - b.startTime);

    let currentTime = startTime;

    for (const slot of sortedWakeSlots) {
      if (currentTime < slot.startTime) {
        sleepSlots.push({
          staId: sta.id,
          startTime: currentTime,
          duration: slot.startTime - currentTime,
          type: 'sleep',
        });
      }
      currentTime = slot.startTime + slot.duration;
    }

    if (currentTime < endTime) {
      sleepSlots.push({
        staId: sta.id,
        startTime: currentTime,
        duration: endTime - currentTime,
        type: 'sleep',
      });
    }

    return sleepSlots;
  }

  checkCollision(slot1: Timeslot, slot2: Timeslot): boolean {
    if (slot1.staId === slot2.staId) return false;
    if (slot1.type !== 'wake' || slot2.type !== 'wake') return false;

    const end1 = slot1.startTime + slot1.duration;
    const end2 = slot2.startTime + slot2.duration;

    return !(end1 <= slot2.startTime || end2 <= slot1.startTime);
  }

  findCollisions(slots: Timeslot[]): Array<[Timeslot, Timeslot]> {
    const collisions: Array<[Timeslot, Timeslot]> = [];
    const wakeSlots = slots.filter((s) => s.type === 'wake');

    for (let i = 0; i < wakeSlots.length; i++) {
      for (let j = i + 1; j < wakeSlots.length; j++) {
        if (this.checkCollision(wakeSlots[i], wakeSlots[j])) {
          collisions.push([wakeSlots[i], wakeSlots[j]]);
        }
      }
    }

    return collisions;
  }

  countCollisionsPerSTA(slots: Timeslot[]): Map<string, number> {
    const collisionCount = new Map<string, number>();
    const wakeSlots = slots.filter((s) => s.type === 'wake');

    for (let i = 0; i < wakeSlots.length; i++) {
      for (let j = i + 1; j < wakeSlots.length; j++) {
        if (this.checkCollision(wakeSlots[i], wakeSlots[j])) {
          collisionCount.set(
            wakeSlots[i].staId,
            (collisionCount.get(wakeSlots[i].staId) || 0) + 1
          );
          collisionCount.set(
            wakeSlots[j].staId,
            (collisionCount.get(wakeSlots[j].staId) || 0) + 1
          );
        }
      }
    }

    return collisionCount;
  }

  optimizeSlots(slots: Timeslot[], maxAttempts = 10): Timeslot[] {
    let optimizedSlots = [...slots];
    let collisions = this.findCollisions(optimizedSlots);

    for (let attempt = 0; attempt < maxAttempts && collisions.length > 0; attempt++) {
      const collisionCount = this.countCollisionsPerSTA(optimizedSlots);
      const maxCollisionSTA = Array.from(collisionCount.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0];

      if (!maxCollisionSTA) break;

      const [staId, _] = maxCollisionSTA;
      const staSlots = optimizedSlots.filter((s) => s.staId === staId && s.type === 'wake');

      if (staSlots.length === 0) break;

      const interval = this.detectInterval(staSlots);
      if (interval <= 0) break;

      optimizedSlots = this.shiftSTAslots(optimizedSlots, staId, interval / 4);
      collisions = this.findCollisions(optimizedSlots);
    }

    return optimizedSlots;
  }

  private detectInterval(slots: Timeslot[]): number {
    if (slots.length < 2) return 0;

    const sorted = [...slots].sort((a, b) => a.startTime - b.startTime);
    const intervals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].startTime - sorted[i - 1].startTime);
    }

    if (intervals.length === 0) return 0;
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  private shiftSTAslots(slots: Timeslot[], staId: string, offset: number): Timeslot[] {
    return slots.map((slot) => {
      if (slot.staId !== staId) return slot;
      return {
        ...slot,
        startTime: slot.startTime + offset,
      };
    });
  }

  getSlotsAtTime(slots: Timeslot[], time: number): Timeslot[] {
    return slots.filter(
      (s) => s.startTime <= time && s.startTime + s.duration > time
    );
  }

  getWakeSlotsForSTA(slots: Timeslot[], staId: string): Timeslot[] {
    return slots.filter((s) => s.staId === staId && s.type === 'wake');
  }

  getSleepSlotsForSTA(slots: Timeslot[], staId: string): Timeslot[] {
    return slots.filter((s) => s.staId === staId && s.type === 'sleep');
  }

  getTotalWakeTime(slots: Timeslot[], staId: string): number {
    return this.getWakeSlotsForSTA(slots, staId).reduce(
      (sum, s) => sum + s.duration,
      0
    );
  }

  getTotalSleepTime(slots: Timeslot[], staId: string): number {
    return this.getSleepSlotsForSTA(slots, staId).reduce(
      (sum, s) => sum + s.duration,
      0
    );
  }

  mergeAdjacentSlots(slots: Timeslot[]): Timeslot[] {
    if (slots.length <= 1) return slots;

    const sorted = [...slots].sort((a, b) => {
      if (a.staId !== b.staId) return a.staId.localeCompare(b.staId);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.startTime - b.startTime;
    });

    const merged: Timeslot[] = [];
    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];

      if (
        current.staId === next.staId &&
        current.type === next.type &&
        current.startTime + current.duration >= next.startTime
      ) {
        current = {
          ...current,
          duration: Math.max(
            current.duration,
            next.startTime + next.duration - current.startTime
          ),
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }
}
