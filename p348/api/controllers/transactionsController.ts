import { Request, Response } from 'express';
import { transactionRepository } from '../services/database/repositories';

export async function getTransactions(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, status } = req.query;

    const options: { limit?: number; offset?: number; status?: 'active' | 'completed' | 'stopped' } = {};
    if (limit) options.limit = Number(limit);
    if (offset) options.offset = Number(offset);
    if (status && ['active', 'completed', 'stopped'].includes(status as string)) {
      options.status = status as 'active' | 'completed' | 'stopped';
    }

    const transactions = transactionRepository.findAll(options);
    res.json(transactions);
  } catch (error) {
    console.error('[API] Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
}

export async function getTransactionById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const transaction = transactionRepository.findById(Number(id));

    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    res.json(transaction);
  } catch (error) {
    console.error('[API] Error getting transaction:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
}
