import { z } from 'zod';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

// computedAmount is never accepted: the server recomputes it on every transfer.
export const transferReclaimSchema = z.strictObject(
  {
    goalId: z.string().min(1, 'Hãy chọn mục tiêu'),
    amount: z
      .number()
      .positive('Số tiền phải là số dương')
      .max(9_999_999_999.99, 'Số tiền vượt quá giới hạn cho phép'),
    accountId: z.string().min(1).optional(),
  },
  rejectUnknownKeys,
);

export class TransferReclaimDto implements z.infer<
  typeof transferReclaimSchema
> {
  goalId!: string;
  amount!: number;
  accountId?: string;
}

export const reclaimHistoryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
});

export class ReclaimHistoryQueryDto implements z.infer<
  typeof reclaimHistoryQuerySchema
> {
  months!: number;
}
