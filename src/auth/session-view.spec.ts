import { maskIp, toSessionView } from './session-view';
import { hashToken } from './token-hash';

describe('maskIp', () => {
  it.each([
    ['113.161.44.12', '113.161.x.x'],
    ['::ffff:113.161.44.12', '113.161.x.x'],
    ['2001:ee0:4f1a:9c00:1d2:3e4f:5a6b:7c8d', '2001:ee0:4f1a:9c00:x:x:x:x'],
    ['::1', '::1'],
    [null, null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(maskIp(input)).toBe(expected);
  });
});

describe('toSessionView', () => {
  const row = {
    id: 7,
    token: 'secret-hash',
    userId: 'u',
    userAgent: 'Mozilla/5.0',
    ipAddress: '10.0.0.5',
    isRevoked: false,
    createdAt: new Date('2026-09-25T02:00:00.000Z'),
    expiresAt: new Date('2026-10-25T02:00:00.000Z'),
  };

  it('exposes exactly the public fields and never the token', () => {
    const view = toSessionView(row, 'other');
    expect(Object.keys(view).sort()).toEqual(
      [
        'expiresAt',
        'id',
        'ipAddress',
        'isCurrent',
        'lastActiveAt',
        'userAgent',
      ].sort(),
    );
    expect(JSON.stringify(view)).not.toContain('secret-hash');
    expect(view).toEqual({
      id: 7,
      userAgent: 'Mozilla/5.0',
      ipAddress: '10.0.x.x',
      lastActiveAt: '2026-09-25T02:00:00.000Z',
      expiresAt: '2026-10-25T02:00:00.000Z',
      isCurrent: false,
    });
  });

  it('marks the current session by token hash', () => {
    expect(toSessionView(row, 'secret-hash').isCurrent).toBe(true);
    expect(toSessionView(row, null).isCurrent).toBe(false);
  });
});

describe('hashToken', () => {
  it('is the sha256 hex digest used for stored refresh tokens', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
