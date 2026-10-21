import { transactionIdParamSchema } from './ai-commentary.dto';

describe('transactionIdParamSchema', () => {
  it('accepts an id', () =>
    expect(
      transactionIdParamSchema.safeParse('cmvezewan000k9bjx').success,
    ).toBe(true));
  it.each(['', '   '])('rejects %p', (value) =>
    expect(transactionIdParamSchema.safeParse(value).success).toBe(false),
  );
});
