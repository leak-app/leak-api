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

export const leakRateQuerySchema = z.object({
  month: z.coerce
    .number({ message: 'Tháng không hợp lệ' })
    .int('Tháng không hợp lệ')
    .min(1, 'Tháng không hợp lệ')
    .max(12, 'Tháng không hợp lệ')
    .optional(),
  year: z.coerce
    .number({ message: 'Năm không hợp lệ' })
    .int('Năm không hợp lệ')
    .min(2000, 'Năm không hợp lệ')
    .max(2100, 'Năm không hợp lệ')
    .optional(),
});

export class LeakRateQueryDto implements z.infer<typeof leakRateQuerySchema> {
  month?: number;
  year?: number;
}
