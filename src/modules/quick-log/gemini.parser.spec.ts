import { Logger } from '@nestjs/common';
import { CallLimiter } from './call-limiter';
import { GeminiParser } from './gemini.parser';
import { NO_CATEGORY } from './gemini.request';

const cats = [
  { id: 'c-food', name: 'Ăn uống' },
  { id: 'c-move', name: 'Di chuyển' },
];

const make = (reply: unknown, enabled = true) => {
  const client = {
    generateJson: jest.fn(() =>
      reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply),
    ),
  };
  return {
    client,
    parser: new GeminiParser(
      enabled ? client : null,
      new CallLimiter(10, 60_000),
    ),
  };
};

describe('GeminiParser', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps a returned category name back to the user’s id', async () => {
    const { parser } = make({
      amount: 25_000,
      type: 'expense',
      category: 'Di chuyển',
    });
    await expect(
      parser.parse('u1', 'hai lăm nghìn xe ôm', cats),
    ).resolves.toEqual({
      amount: 25_000,
      type: 'EXPENSE',
      categoryId: 'c-move',
    });
  });

  it('maps income and a null amount', async () => {
    const { parser } = make({
      amount: null,
      type: 'income',
      category: NO_CATEGORY,
    });
    await expect(parser.parse('u1', 'lương', cats)).resolves.toEqual({
      amount: null,
      type: 'INCOME',
      categoryId: null,
    });
  });

  it('never turns an unknown, none or duplicated name into an id', async () => {
    for (const category of ['Thú cưng', NO_CATEGORY]) {
      const { parser } = make({ amount: 1000, type: 'expense', category });
      expect((await parser.parse('u1', 'x', cats))?.categoryId).toBeNull();
    }
    const dup = [
      { id: 'a', name: 'Ăn uống' },
      { id: 'b', name: 'Ăn uống' },
    ];
    const { parser } = make({
      amount: 1000,
      type: 'expense',
      category: 'Ăn uống',
    });
    expect((await parser.parse('u1', 'x', dup))?.categoryId).toBeNull();
  });

  it.each([
    { amount: 0, type: 'expense', category: 'Ăn uống' },
    { amount: 10 ** 9, type: 'expense', category: 'Ăn uống' },
    { amount: 1.5, type: 'expense', category: 'Ăn uống' },
    { amount: 1000, type: 'transfer', category: 'Ăn uống' },
    { amount: 1000, type: 'expense' },
    'not an object',
    null,
  ])('rejects malformed output %j', async (reply) => {
    expect(await make(reply).parser.parse('u1', 'x', cats)).toBeNull();
  });

  it('returns null instead of throwing when the client fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    expect(
      await make(new Error('timeout')).parser.parse('u1', 'x', cats),
    ).toBeNull();
  });

  it('does not call out when disabled', async () => {
    const { client, parser } = make({}, false);
    expect(await parser.parse('u1', 'x', cats)).toBeNull();
    expect(client.generateJson).not.toHaveBeenCalled();
  });

  it('stops calling once the user is over the limit', async () => {
    const client = {
      generateJson: jest.fn(() =>
        Promise.resolve({ amount: 1000, type: 'expense', category: 'Ăn uống' }),
      ),
    };
    const parser = new GeminiParser(client, new CallLimiter(1, 60_000));
    await parser.parse('u1', 'x', cats);
    expect(await parser.parse('u1', 'x', cats)).toBeNull();
    expect(client.generateJson).toHaveBeenCalledTimes(1);
  });

  it('sends the phrase only in the user message, never the system prompt', async () => {
    const { client, parser } = make({
      amount: 1000,
      type: 'expense',
      category: 'Ăn uống',
    });
    await parser.parse('u1', 'secret 55k', cats);
    const [request] = client.generateJson.mock.calls[0] as unknown as [
      { system: string; user: string },
    ];
    expect(request.system).not.toContain('secret');
    expect(request.user).toContain('secret 55k');
  });

  it('logs failures without the phrase', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await make(new Error('quota exceeded')).parser.parse(
      'u1',
      'secret 55k',
      cats,
    );
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('logs malformed output without echoing it', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await make({
      amount: 'secret',
      type: 'expense',
      category: 'x',
    }).parser.parse('u1', 'x', cats);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });
});
