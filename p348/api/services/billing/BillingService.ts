import { pricingRepository, billingRepository, transactionRepository } from '../database/repositories';
import { BillingDetail, PricingRule } from '../../../shared/types';

export interface BillingCalculationResult {
  billingDetail: Omit<BillingDetail, 'id' | 'createdAt'>;
  pricingRule: PricingRule;
}

export class BillingService {
  calculateBilling(
    transactionId: number,
    startTime: Date,
    stopTime: Date,
    startMeter: number,
    stopMeter: number
  ): BillingCalculationResult {
    const energyConsumed = stopMeter - startMeter;
    const durationMs = stopTime.getTime() - startTime.getTime();
    const durationMinutes = Math.ceil(durationMs / (1000 * 60));

    const pricingRule = this.matchPricingRule(startTime);
    const energyKwh = energyConsumed / 1000;

    const energyCost = energyKwh * pricingRule.energyRate;
    const serviceCost = energyKwh * pricingRule.serviceRate;
    const totalCost = energyCost + serviceCost;

    const billingDetail: Omit<BillingDetail, 'id' | 'createdAt'> = {
      transactionId,
      energyConsumed,
      durationMinutes,
      energyPrice: pricingRule.energyRate,
      servicePrice: pricingRule.serviceRate,
      energyCost: Math.round(energyCost * 100) / 100,
      serviceCost: Math.round(serviceCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      pricingRuleId: pricingRule.id
    };

    return { billingDetail, pricingRule };
  }

  saveBilling(detail: Omit<BillingDetail, 'id' | 'createdAt'>): number {
    return billingRepository.create(detail);
  }

  completeTransactionAndBilling(
    transactionId: number,
    stopTime: Date,
    stopMeter: number
  ): BillingDetail {
    const transaction = transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    if (transaction.status === 'completed') {
      const existing = billingRepository.findByTransactionId(transactionId);
      if (existing) return existing;
    }

    const energyConsumed = stopMeter - transaction.startMeterValue;
    const duration = Math.floor((stopTime.getTime() - transaction.startTime.getTime()) / 1000);

    transactionRepository.complete(transactionId, {
      stopTime,
      stopMeterValue: stopMeter,
      energyConsumed,
      duration
    });

    const { billingDetail } = this.calculateBilling(
      transactionId,
      transaction.startTime,
      stopTime,
      transaction.startMeterValue,
      stopMeter
    );

    this.saveBilling(billingDetail);

    return { ...billingDetail, id: 0, createdAt: new Date() };
  }

  private matchPricingRule(time: Date): PricingRule {
    const activeRules = pricingRepository.findActive();
    if (activeRules.length === 0) {
      return {
        id: 0,
        name: '默认电价',
        startTime: '00:00',
        endTime: '23:59',
        energyRate: 1.0,
        serviceRate: 0.5,
        isActive: true
      };
    }

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    for (const rule of activeRules) {
      const [startH, startM] = rule.startTime.split(':').map(Number);
      const [endH, endM] = rule.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes < endMinutes) {
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          return rule;
        }
      } else {
        if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
          return rule;
        }
      }
    }

    return activeRules[0];
  }
}

export const billingService = new BillingService();
