import { CallLimiter } from './call-limiter';

describe('CallLimiter', () => {
  it('allows up to the limit per key per window, then refuses', () => {
    const limiter = new CallLimiter(2, 60_000);
    expect(limiter.tryAcquire('u1', 0)).toBe(true);
    expect(limiter.tryAcquire('u1', 1)).toBe(true);
    expect(limiter.tryAcquire('u1', 2)).toBe(false);
    expect(limiter.tryAcquire('u2', 2)).toBe(true);
  });

  it('opens a fresh window after windowMs', () => {
    const limiter = new CallLimiter(1, 60_000);
    limiter.tryAcquire('u1', 0);
    expect(limiter.tryAcquire('u1', 59_999)).toBe(false);
    expect(limiter.tryAcquire('u1', 60_000)).toBe(true);
  });

  it('drops expired windows so the map does not grow without bound', () => {
    const limiter = new CallLimiter(1, 1_000);
    for (let i = 0; i < 100; i++) limiter.tryAcquire(`u${i}`, 0);
    limiter.tryAcquire('late', 5_000);
    expect(limiter.size).toBe(1);
  });
});
