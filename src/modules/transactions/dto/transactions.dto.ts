import { z } from 'zod';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';

export const createTransactionSchema = z.object({
  amount: z.number().positive('Số tiền phải là số dương'),
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

export const updateTransactionSchema = z.object({
  amount: z.number().positive('Số tiền phải là số dương').optional(),
  type: z.nativeEnum(TransactionType).optional(),
  categoryId: z.string().optional(),
  accountId: z.string().min(1).optional(),
  description: z.string().optional(),
});

export class UpdateTransactionDto implements z.infer<
  typeof updateTransactionSchema
> {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  description?: string;
}

export const outcomeFilterSchema = z
  .nativeEnum(SpendOutcome, {
    message: 'Bộ lọc kết quả đánh giá không hợp lệ',
  })
  .optional();
