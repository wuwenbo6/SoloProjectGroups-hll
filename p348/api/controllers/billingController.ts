import { Request, Response } from 'express';
import { billingRepository, pricingRepository } from '../services/database/repositories';

export async function getBillingDetails(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset } = req.query;

    const options: { limit?: number; offset?: number } = {};
    if (limit) options.limit = Number(limit);
    if (offset) options.offset = Number(offset);

    const billingDetails = billingRepository.findAll(options);
    res.json(billingDetails);
  } catch (error) {
    console.error('[API] Error getting billing details:', error);
    res.status(500).json({ error: 'Failed to get billing details' });
  }
}

export async function getBillingByTransactionId(req: Request, res: Response): Promise<void> {
  try {
    const { transactionId } = req.params;
    const billing = billingRepository.findByTransactionId(Number(transactionId));

    if (!billing) {
      res.status(404).json({ error: 'Billing detail not found' });
      return;
    }

    res.json(billing);
  } catch (error) {
    console.error('[API] Error getting billing detail:', error);
    res.status(500).json({ error: 'Failed to get billing detail' });
  }
}

export async function getPricingRules(req: Request, res: Response): Promise<void> {
  try {
    const rules = pricingRepository.findAll();
    res.json(rules);
  } catch (error) {
    console.error('[API] Error getting pricing rules:', error);
    res.status(500).json({ error: 'Failed to get pricing rules' });
  }
}
