import { beforeAll, describe, expect, it } from 'vitest';
import { getAdminUser, setCredentials, verifyPassword } from '../src/server/config';
import { checkCredentials, issueToken, verifyToken } from '../src/server/auth';

beforeAll(() => {
  setCredentials('admin', 'correct-horse');
});

describe('credential store', () => {
  it('verifies the stored password', () => {
    expect(verifyPassword('correct-horse')).toBe(true);
    expect(verifyPassword('wrong')).toBe(false);
  });

  it('checks username and password together', () => {
    expect(checkCredentials('admin', 'correct-horse')).toBe(true);
    expect(checkCredentials('admin', 'nope')).toBe(false);
    expect(checkCredentials('someone', 'correct-horse')).toBe(false);
    expect(getAdminUser()).toBe('admin');
  });
});

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    expect(verifyToken(issueToken('admin'))).toBe('admin');
  });

  it('rejects tampered or malformed tokens', () => {
    const token = issueToken('admin');
    const [payload] = token.split('.');
    expect(verifyToken(`${payload}.deadbeef`)).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() - 1000 })).toString('base64url');
    expect(verifyToken(`${expired}.${'x'.repeat(10)}`)).toBeNull();
  });
});
