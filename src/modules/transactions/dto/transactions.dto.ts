import { z } from 'zod';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';

/** The largest value a Decimal(12, 2) column holds, without the cents. */
const MAX_AMOUNT = 9_999_999_999;

export const createTransactionSchema = z.object({
  amount: z
    .number()
    .positive('Số tiền phải là số dương')
    .max(MAX_AMOUNT, 'Số tiền quá lớn'),
  type: z.nativeEnum(TransactionType),
  categoryId: z.string().min(1, 'Danh mục là bắt buộc'),
  accountId: z.string().min(1).optional(),
  description: z.string().optional(),
  /** The day it happened (YYYY-MM-DD, Vietnam time); today when left out. */
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày giao dịch không hợp lệ')
    .optional(),
});

export class CreateTransactionDto implements z.infer<
  typeof createTransactionSchema
> {
  amount!: number;
  type!: TransactionType;
  categoryId!: string;
  accountId?: string;
  description?: string;
  occurredOn?: string;
}

export const updateTransactionSchema = z
  .object({
    amount: z
      .number()
      .positive('Số tiền phải là số dương')
      .max(MAX_AMOUNT, 'Số tiền quá lớn')
      .optional(),
    type: z.nativeEnum(TransactionType).optional(),
    categoryId: z.string().min(1, 'Danh mục là bắt buộc').optional(),
    accountId: z.string().min(1).optional(),
    /** Blank clears the note. */
    description: z.string().optional(),
    /** Move to another day (YYYY-MM-DD, Vietnam time); the time of day is kept. */
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày giao dịch không hợp lệ')
      .optional(),
  })
  // A misspelled field (walletId) must fail loudly, not be dropped and "succeed".
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Không có thay đổi nào để lưu',
  });

export class UpdateTransactionDto implements z.infer<
  typeof updateTransactionSchema
> {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  description?: string;
  occurredOn?: string;
}

export const outcomeFilterSchema = z
  .nativeEnum(SpendOutcome, {
    message: 'Bộ lọc kết quả đánh giá không hợp lệ',
  })
  .optional();
