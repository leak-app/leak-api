import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ month: z.coerce.number().int().min(1).max(12) });

  it('validates the body by default and ignores other targets', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ month: 'x' }, { type: 'query' })).toEqual({
      month: 'x',
    });
    expect(() => pipe.transform({ month: 'x' }, { type: 'body' })).toThrow(
      BadRequestException,
    );
  });

  it('validates and coerces query params when targeting the query', () => {
    const pipe = new ZodValidationPipe(schema, 'query');
    expect(pipe.transform({ month: '9' }, { type: 'query' })).toEqual({
      month: 9,
    });
    expect(() => pipe.transform({ month: '13' }, { type: 'query' })).toThrow(
      BadRequestException,
    );
  });

  it('omits the empty path prefix for object-level issues', () => {
    const pipe = new ZodValidationPipe(z.strictObject({ a: z.string() }));
    try {
      pipe.transform({ a: 'x', b: 1 }, { type: 'body' });
      throw new Error('expected a BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const { message } = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(message).toHaveLength(1);
      expect(message[0].startsWith(':')).toBe(false);
    }
  });
});
