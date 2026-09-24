import { z } from 'zod';
import { LeakReason } from '@/generated/prisma/client';

export const reviewOutcomeSchema = z
  .object({
    outcome: z.enum(['WORTH_IT', 'NEUTRAL', 'LEAK'], {
      message: 'Kết quả đánh giá không hợp lệ',
    }),
    leakReason: z
      .nativeEnum(LeakReason, { message: 'Lý do rò rỉ không hợp lệ' })
      .optional(),
  })
  .refine((v) => v.outcome === 'LEAK' || v.leakReason === undefined, {
    message: 'Lý do rò rỉ chỉ áp dụng cho khoản chi rò rỉ',
    path: ['leakReason'],
  });

export class ReviewOutcomeDto implements z.infer<typeof reviewOutcomeSchema> {
  outcome!: 'WORTH_IT' | 'NEUTRAL' | 'LEAK';
  leakReason?: LeakReason;
}
