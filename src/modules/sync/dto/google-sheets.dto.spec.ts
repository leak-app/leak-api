import {
  callbackQuerySchema,
  toggleSheetsSyncSchema,
} from './google-sheets.dto';

describe('toggleSheetsSyncSchema', () => {
  it('accepts a boolean', () => {
    expect(toggleSheetsSyncSchema.parse({ enabled: true })).toEqual({
      enabled: true,
    });
    expect(toggleSheetsSyncSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
  });

  it.each([
    {},
    { enabled: 'true' },
    { enabled: 1 },
    { enabled: true, extra: 1 },
  ])('rejects %j', (payload) => {
    expect(toggleSheetsSyncSchema.safeParse(payload).success).toBe(false);
  });

  it('names unknown keys in the error', () => {
    const result = toggleSheetsSyncSchema.safeParse({
      enabled: true,
      extra: 1,
    });
    expect(JSON.stringify(result.error?.issues)).toContain('extra');
  });
});

describe('callbackQuerySchema', () => {
  it('accepts the params Google sends and ignores the extra ones', () => {
    expect(
      callbackQuerySchema.parse({
        code: 'abc',
        state: 'xyz',
        scope: 'openid email',
        authuser: '0',
        prompt: 'consent',
      }),
    ).toEqual({ code: 'abc', state: 'xyz' });
  });

  it('accepts an error-only callback', () => {
    expect(callbackQuerySchema.parse({ error: 'access_denied' })).toEqual({
      error: 'access_denied',
    });
  });

  it('accepts an empty query', () => {
    expect(callbackQuerySchema.parse({})).toEqual({});
  });
});
