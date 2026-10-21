/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
}));

import { GeminiClient } from './gemini.client';

const request = { system: 's', user: 'u', schema: { type: 'object' } };

describe('GeminiClient', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({ text: '{"ok":true}' });
  });

  it('is deterministic unless the request asks for a temperature', async () => {
    const client = new GeminiClient('key', 'model', 1000);

    await client.generateJson(request);
    await client.generateJson({ ...request, temperature: 0.9 });

    expect(mockGenerateContent.mock.calls[0][0].config.temperature).toBe(0);
    expect(mockGenerateContent.mock.calls[1][0].config.temperature).toBe(0.9);
  });

  it('returns the parsed JSON', async () => {
    const client = new GeminiClient('key', 'model', 1000);
    await expect(client.generateJson(request)).resolves.toEqual({ ok: true });
  });

  it('rejects when the model returns no text', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });
    const client = new GeminiClient('key', 'model', 1000);
    await expect(client.generateJson(request)).rejects.toThrow('no text');
  });
});
