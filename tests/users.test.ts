import { describe, expect, it } from 'vitest';
import { parsePassdbVerbose, validatePassword, validateUsername } from '../src/server/samba/users';

const SAMPLE = `Unix username:        alice
NT username:
Account Flags:        [U          ]
User SID:             S-1-5-21-1-2-3-1001
Primary Group SID:    S-1-5-21-1-2-3-513
Full Name:            Alice Example

Unix username:        bob
NT username:
Account Flags:        [DU         ]
User SID:             S-1-5-21-1-2-3-1002
Primary Group SID:    S-1-5-21-1-2-3-513
Full Name:            Bob Example
`;

describe('parsePassdbVerbose', () => {
  it('extracts usernames, full names and disabled flag', () => {
    const entries = parsePassdbVerbose(SAMPLE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ username: 'alice', fullName: 'Alice Example', flags: 'U' });
    expect(entries[1].username).toBe('bob');
    expect(entries[1].flags.toUpperCase()).toContain('D');
  });

  it('returns nothing for empty output', () => {
    expect(parsePassdbVerbose('')).toEqual([]);
  });
});

describe('user validation', () => {
  it('accepts valid usernames and passwords', () => {
    expect(() => validateUsername('alice')).not.toThrow();
    expect(() => validateUsername('a_b-1')).not.toThrow();
    expect(() => validatePassword('secret1')).not.toThrow();
  });

  it('rejects invalid usernames', () => {
    expect(() => validateUsername('1abc')).toThrow();
    expect(() => validateUsername('has space')).toThrow();
    expect(() => validateUsername('')).toThrow();
  });

  it('rejects short passwords', () => {
    expect(() => validatePassword('12345')).toThrow();
  });
});
