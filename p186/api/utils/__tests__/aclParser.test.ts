import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseNFS4ACL,
  serializeACEToCommand,
  serializeACLsToCommand,
  validateACE,
  createEmptyACE,
  sortACEs,
  isInheritedACE,
} from '../aclParser.js';
import type { ACE } from '../../../shared/types.js';

describe('ACL Parser', () => {
  describe('parseNFS4ACL', () => {
    it('should parse and sort ACL output', () => {
      const input = `A::user:alice:rwx
D::group:staff:rw
A:fdi:user:bob:rwxnNcCo`;

      const result = parseNFS4ACL(input);

      assert.equal(result.length, 3);
      assert.equal(result[0].flags, 'fdi');
      assert.equal(result[0].type, 'D');
      assert.equal(result[0].principal, 'user:bob');
      assert.equal(result[1].type, 'A');
      assert.equal(result[1].flags, 'fdi');
      assert.equal(result[2].type, 'D');
      assert.equal(result[2].flags, '');
    });

    it('should skip comments and empty lines', () => {
      const input = `# This is a comment
$ getfacl output

A::user:alice:rwx

# Another comment
D::group:staff:r`;

      const result = parseNFS4ACL(input);

      assert.equal(result.length, 2);
    });

    it('should return empty array for invalid input', () => {
      const input = `invalid line
another invalid`;

      const result = parseNFS4ACL(input);

      assert.equal(result.length, 0);
    });

    it('should handle empty input', () => {
      const result = parseNFS4ACL('');
      assert.equal(result.length, 0);
    });
  });

  describe('sortACEs', () => {
    it('should sort: inherited before self-owned, deny before allow', () => {
      const aces: ACE[] = [
        { type: 'A', flags: '', principal: 'user:alice', permissions: ['r'] },
        { type: 'A', flags: 'fdi', principal: 'user:bob', permissions: ['r'] },
        { type: 'D', flags: '', principal: 'group:staff', permissions: ['r'] },
        { type: 'D', flags: 'fdi', principal: 'group:admin', permissions: ['r'] },
      ];

      const sorted = sortACEs(aces);

      assert.equal(sorted[0].principal, 'group:admin');
      assert.equal(sorted[0].flags, 'fdi');
      assert.equal(sorted[0].type, 'D');

      assert.equal(sorted[1].principal, 'user:bob');
      assert.equal(sorted[1].flags, 'fdi');
      assert.equal(sorted[1].type, 'A');

      assert.equal(sorted[2].principal, 'group:staff');
      assert.equal(sorted[2].flags, '');
      assert.equal(sorted[2].type, 'D');

      assert.equal(sorted[3].principal, 'user:alice');
      assert.equal(sorted[3].flags, '');
      assert.equal(sorted[3].type, 'A');
    });

    it('should not mutate original array', () => {
      const aces: ACE[] = [
        { type: 'A', flags: '', principal: 'user:alice', permissions: ['r'] },
        { type: 'D', flags: '', principal: 'group:staff', permissions: ['r'] },
      ];

      const sorted = sortACEs(aces);
      assert.equal(aces[0].type, 'A');
      assert.equal(sorted[0].type, 'D');
    });
  });

  describe('isInheritedACE', () => {
    it('should return true for ACE with inheritance flags', () => {
      const ace: ACE = { type: 'A', flags: 'fdi', principal: 'user:bob', permissions: ['r'] };
      assert.equal(isInheritedACE(ace), true);
    });

    it('should return false for ACE without inheritance flags', () => {
      const ace: ACE = { type: 'A', flags: '', principal: 'user:alice', permissions: ['r'] };
      assert.equal(isInheritedACE(ace), false);
    });

    it('should return false for ACE with only audit flags', () => {
      const ace: ACE = { type: 'A', flags: 'S', principal: 'user:alice', permissions: ['r'] };
      assert.equal(isInheritedACE(ace), false);
    });
  });

  describe('serializeACEToCommand', () => {
    it('should serialize ACE to command format', () => {
      const ace: ACE = {
        type: 'A',
        flags: 'fdi',
        principal: 'user:alice',
        permissions: ['r', 'w', 'x'],
      };

      const result = serializeACEToCommand(ace);
      assert.equal(result, 'A:fdi:user:alice:rwx');
    });

    it('should handle ACE without flags', () => {
      const ace: ACE = {
        type: 'D',
        flags: '',
        principal: 'group:staff',
        permissions: ['r'],
      };

      const result = serializeACEToCommand(ace);
      assert.equal(result, 'D::group:staff:r');
    });
  });

  describe('serializeACLsToCommand', () => {
    it('should serialize multiple ACEs to command format', () => {
      const aces: ACE[] = [
        {
          type: 'A',
          flags: '',
          principal: 'user:alice',
          permissions: ['r', 'w', 'x'],
        },
        {
          type: 'D',
          flags: 'fdi',
          principal: 'group:staff',
          permissions: ['r', 'w'],
        },
      ];

      const result = serializeACLsToCommand(aces);
      assert.equal(result, 'A::user:alice:rwx,D:fdi:group:staff:rw');
    });
  });

  describe('validateACE', () => {
    it('should validate correct ACE', () => {
      const ace: ACE = {
        type: 'A',
        flags: '',
        principal: 'user:alice',
        permissions: ['r', 'w'],
      };

      assert.equal(validateACE(ace), true);
    });

    it('should reject invalid type', () => {
      const ace = {
        type: 'X',
        flags: '',
        principal: 'user:alice',
        permissions: ['r'],
      } as unknown as ACE;

      assert.equal(validateACE(ace), false);
    });

    it('should reject empty principal', () => {
      const ace: ACE = {
        type: 'A',
        flags: '',
        principal: '',
        permissions: ['r'],
      };

      assert.equal(validateACE(ace), false);
    });

    it('should reject empty permissions', () => {
      const ace: ACE = {
        type: 'A',
        flags: '',
        principal: 'user:alice',
        permissions: [],
      };

      assert.equal(validateACE(ace), false);
    });
  });

  describe('createEmptyACE', () => {
    it('should create empty ACE with default values', () => {
      const ace = createEmptyACE();
      assert.deepEqual(ace, {
        type: 'A',
        flags: '',
        principal: '',
        permissions: [],
      });
    });
  });
});
