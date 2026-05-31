import db from '../database/index.ts';
import { SelectorStrategy, SelectorType } from '../../shared/types.ts';

export class SettingsRepository {
  async getSelectorStrategy(): Promise<SelectorStrategy> {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM settings WHERE key = ?', ['selector_priority'], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (row) {
          resolve({ priority: JSON.parse(row.value) as SelectorType[] });
        } else {
          resolve({ priority: ['id', 'name', 'css', 'xpath'] });
        }
      });
    });
  }

  async saveSelectorStrategy(strategy: SelectorStrategy): Promise<SelectorStrategy> {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [JSON.stringify(strategy.priority), 'selector_priority'],
        function (err) {
          if (err) {
            reject(err);
            return;
          }
          if (this.changes === 0) {
            db.run(
              'INSERT INTO settings (id, key, value) VALUES (?, ?, ?)',
              ['1', 'selector_priority', JSON.stringify(strategy.priority)],
              (insertErr) => {
                if (insertErr) {
                  reject(insertErr);
                } else {
                  resolve(strategy);
                }
              }
            );
          } else {
            resolve(strategy);
          }
        }
      );
    });
  }
}

export default new SettingsRepository();
