import { z } from 'zod';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

/** Money columns are Decimal(12, 2): about 10 billion. */
const MAX_AMOUNT = 9_999_999_999.99;

export const createTransferSchema = z.strictObject(
  {
    fromAccountId: z.string().min(1, 'Hãy chọn ví nguồn'),
    toAccountId: z.string().min(1, 'Hãy chọn ví nhận'),
    amount: z
      .number()
      .positive('Số tiền phải là số dương')
      .max(MAX_AMOUNT, 'Số tiền vượt quá giới hạn 10 tỷ ₫'),
    note: z.string().trim().max(120).optional(),
    occurredAt: z.iso.date().optional(), // today when omitted
  },
  rejectUnknownKeys,
);

export class CreateTransferDto implements z.infer<typeof createTransferSchema> {
  fromAccountId!: string;
  toAccountId!: string;
  amount!: number;
  note?: string;
  occurredAt?: string;
}

export const listTransfersQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
});

export class ListTransfersQueryDto implements z.infer<
  typeof listTransfersQuerySchema
> {
  accountId?: string;
}
