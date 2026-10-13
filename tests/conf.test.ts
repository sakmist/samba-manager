import { describe, expect, it } from 'vitest';
import type { Share } from '../src/shared/types';
import {
  parseFragment,
  serialiseFragment,
  validateShareName,
  validateSharePath,
  ValidationError,
} from '../src/server/samba/conf';

const SHARE: Share = {
  name: 'data',
  path: '/srv/data',
  comment: 'Team files',
  browseable: true,
  readOnly: false,
  guestOk: false,
  available: true,
  validUsers: ['alice', 'bob'],
  writeList: ['alice'],
  createMask: '0664',
  directoryMask: '0775',
  forceUser: 'alice',
  forceGroup: 'users',
};

describe('share config fragment', () => {
  it('round-trips through serialise and parse', () => {
    const text = serialiseFragment([SHARE]);
    expect(text).toContain('[data]');
    expect(text).toContain('path = /srv/data');
    expect(text).toContain('valid users = alice, bob');
    expect(text).toContain('read only = no');

    const [parsed] = parseFragment(text);
    expect(parsed).toEqual(SHARE);
  });

  it('parses a hand-written fragment and applies defaults', () => {
    const [parsed] = parseFragment('[media]\n   path = /srv/media\n');
    expect(parsed.name).toBe('media');
    expect(parsed.path).toBe('/srv/media');
    expect(parsed.readOnly).toBe(true);
    expect(parsed.browseable).toBe(true);
    expect(parsed.createMask).toBe('0664');
    expect(parsed.validUsers).toEqual([]);
  });

  it('ignores comments and blank lines', () => {
    const text = '# a comment\n\n; another\n[data]\n   path = /srv/data\n';
    expect(parseFragment(text)).toHaveLength(1);
  });

  it('emits an empty body when no shares remain', () => {
    expect(serialiseFragment([])).not.toContain('[');
  });
});

describe('share validation', () => {
  it('accepts sensible names', () => {
    expect(() => validateShareName('data')).not.toThrow();
    expect(() => validateShareName('team-files_2')).not.toThrow();
  });

  it('rejects reserved or malformed names', () => {
    expect(() => validateShareName('global')).toThrow(ValidationError);
    expect(() => validateShareName('has space')).toThrow(ValidationError);
    expect(() => validateShareName('')).toThrow(ValidationError);
  });

  it('requires an absolute path without traversal', () => {
    expect(() => validateSharePath('/srv/data')).not.toThrow();
    expect(() => validateSharePath('srv/data')).toThrow(ValidationError);
    expect(() => validateSharePath('/srv/../../etc')).toThrow(ValidationError);
  });
});
