import { Request, Response } from 'express';
import testCaseRepository from '../repositories/TestCaseRepository.ts';
import { TestCase } from '../../shared/types.ts';
import { v4 as uuidv4 } from 'uuid';

export class TestCaseController {
  async getAll(req: Request, res: Response) {
    try {
      const cases = await testCaseRepository.getAll();
      res.json(cases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const testCase = await testCaseRepository.getById(id);
      if (!testCase) {
        res.status(404).json({ error: 'Test case not found' });
        return;
      }
      res.json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const testCase: TestCase = {
        ...req.body,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const created = await testCaseRepository.create(testCase);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const testCase: TestCase = {
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      const updated = await testCaseRepository.update(id, testCase);
      if (!updated) {
        res.status(404).json({ error: 'Test case not found' });
        return;
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await testCaseRepository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Test case not found' });
        return;
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new TestCaseController();
