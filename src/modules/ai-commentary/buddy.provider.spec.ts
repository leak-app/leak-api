import { ConfigService } from '@nestjs/config';
import { createBuddyGenerator } from './buddy.provider';

const config = (values: Record<string, string>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('createBuddyGenerator', () => {
  it('is off by default', () =>
    expect(createBuddyGenerator(config({})).isEnabled).toBe(false));

  it('stays off with the flag but no Gemini key', () =>
    expect(
      createBuddyGenerator(config({ AI_BUDDY_ENABLED: 'true' })).isEnabled,
    ).toBe(false));

  it('stays off with a key but without the flag', () =>
    expect(
      createBuddyGenerator(config({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }))
        .isEnabled,
    ).toBe(false));

  it('turns on only with the flag, a key and a model', () =>
    expect(
      createBuddyGenerator(
        config({
          AI_BUDDY_ENABLED: 'true',
          GEMINI_API_KEY: 'k',
          GEMINI_MODEL: 'm',
        }),
      ).isEnabled,
    ).toBe(true));
});
