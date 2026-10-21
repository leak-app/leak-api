import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini.client';
import { createGeminiClient, positiveInt } from './gemini.config';

// A plain stub, so the real process.env can never leak a key into these tests.
const config = (values: Record<string, string>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('positiveInt', () => {
  it('keeps a positive integer', () => expect(positiveInt('7', 3)).toBe(7));
  it.each([undefined, '', 'abc', '0', '-2', '1.5'])(
    'falls back for %p',
    (raw) => expect(positiveInt(raw, 3)).toBe(3),
  );
});

describe('createGeminiClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is null without a key', () => {
    expect(createGeminiClient(config({}))).toBeNull();
  });

  it('treats a blank key as off', () => {
    expect(createGeminiClient(config({ GEMINI_API_KEY: '  ' }))).toBeNull();
  });

  it('is null and says why when the key has no model, without logging the key', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    expect(
      createGeminiClient(config({ GEMINI_API_KEY: 'secret-key' })),
    ).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GEMINI_MODEL'));
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-key');
  });

  it('builds a client when the key and model are set', () => {
    const client = createGeminiClient(
      config({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }),
    );
    expect(client).toBeInstanceOf(GeminiClient);
  });
});
