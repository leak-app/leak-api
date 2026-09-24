import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { type ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodSchema,
    private readonly target: 'body' | 'query' = 'body',
  ) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== this.target) {
      return value;
    }
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errors = result.error.issues.map(
        (err) => `${err.path.join('.')}: ${err.message}`,
      );
      throw new BadRequestException({
        message: errors,
        error: 'Bad Request',
      });
    }

    return result.data;
  }
}
