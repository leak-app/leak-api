import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGeminiParser } from './gemini.provider';

// A plain stub, so the real process.env can never leak a key into these tests.
const config = (values: Record<string, string>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('createGeminiParser', () => {
  afterEach(() => jest.restoreAllMocks());

  const categories = [{ id: 'c1', name: 'Ăn uống' }];

  it('is off without a key: no client, no outbound call', async () => {
    const parser = createGeminiParser(config({}));
    await expect(parser.parse('u1', 'x', categories)).resolves.toBeNull();
  });

  it('treats a blank key as off', async () => {
    const parser = createGeminiParser(config({ GEMINI_API_KEY: '  ' }));
    await expect(parser.parse('u1', 'x', categories)).resolves.toBeNull();
  });

  it('stays off and says why when the key has no model', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const parser = createGeminiParser(config({ GEMINI_API_KEY: 'k' }));

    await expect(parser.parse('u1', 'x', categories)).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GEMINI_MODEL'));
    expect(JSON.stringify(error.mock.calls)).not.toContain('"k"');
  });
});
