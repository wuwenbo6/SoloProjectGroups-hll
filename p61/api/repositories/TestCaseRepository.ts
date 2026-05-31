import db from '../database/index.ts';
import { TestCase, ActionStep } from '../../shared/types.ts';

export class TestCaseRepository {
  async getAll(): Promise<TestCase[]> {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM test_cases ORDER BY updated_at DESC', async (err, cases: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const testCases: TestCase[] = [];
        for (const caseRow of cases) {
          const steps = await this.getStepsByCaseId(caseRow.id);
          testCases.push({
            id: caseRow.id,
            name: caseRow.name,
            description: caseRow.description,
            url: caseRow.url,
            steps,
            createdAt: caseRow.created_at,
            updatedAt: caseRow.updated_at,
          });
        }
        resolve(testCases);
      });
    });
  }

  async getById(id: string): Promise<TestCase | null> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM test_cases WHERE id = ?', [id], async (err, caseRow: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!caseRow) {
          resolve(null);
          return;
        }

        const steps = await this.getStepsByCaseId(id);
        resolve({
          id: caseRow.id,
          name: caseRow.name,
          description: caseRow.description,
          url: caseRow.url,
          steps,
          createdAt: caseRow.created_at,
          updatedAt: caseRow.updated_at,
        });
      });
    });
  }

  private getStepsByCaseId(caseId: string): Promise<ActionStep[]> {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM action_steps WHERE case_id = ? ORDER BY order_index ASC',
        [caseId],
        (err, steps: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(
            steps.map((step) => ({
              id: step.id,
              type: step.type,
              selector: step.selector,
              selectorType: step.selector_type,
              value: step.value,
              timestamp: 0,
              elementDescription: step.element_description,
            }))
          );
        }
      );
    });
  }

  async create(testCase: TestCase): Promise<TestCase> {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(
          'INSERT INTO test_cases (id, name, description, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [testCase.id, testCase.name, testCase.description, testCase.url, testCase.createdAt, testCase.updatedAt],
          (err) => {
            if (err) {
              reject(err);
              return;
            }
          }
        );

        const stmt = db.prepare(
          'INSERT INTO action_steps (id, case_id, order_index, type, selector, selector_type, value, element_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        testCase.steps.forEach((step, index) => {
          stmt.run(step.id, testCase.id, index, step.type, step.selector, step.selectorType, step.value, step.elementDescription);
        });

        stmt.finalize((err) => {
          if (err) {
            reject(err);
          } else {
            resolve(testCase);
          }
        });
      });
    });
  }

  async update(id: string, testCase: TestCase): Promise<TestCase | null> {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(
          'UPDATE test_cases SET name = ?, description = ?, url = ?, updated_at = ? WHERE id = ?',
          [testCase.name, testCase.description, testCase.url, testCase.updatedAt, id],
          (err) => {
            if (err) {
              reject(err);
              return;
            }
          }
        );

        db.run('DELETE FROM action_steps WHERE case_id = ?', [id], (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        const stmt = db.prepare(
          'INSERT INTO action_steps (id, case_id, order_index, type, selector, selector_type, value, element_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        testCase.steps.forEach((step, index) => {
          stmt.run(step.id, id, index, step.type, step.selector, step.selectorType, step.value, step.elementDescription);
        });

        stmt.finalize((err) => {
          if (err) {
            reject(err);
          } else {
            resolve(testCase);
          }
        });
      });
    });
  }

  async delete(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM test_cases WHERE id = ?', [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }
}

export default new TestCaseRepository();
