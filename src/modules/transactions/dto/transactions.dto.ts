import { z } from 'zod';
import { TransactionType } from '@/generated/prisma/client';

export const createTransactionSchema = z.object({
  amount: z.number().positive('Số tiền phải là số dương'),
  type: z.nativeEnum(TransactionType),
  categoryId: z.string().min(1, 'Danh mục là bắt buộc'),
  description: z.string().optional(),
});

export class CreateTransactionDto implements z.infer<
  typeof createTransactionSchema
> {
  amount!: number;
  type!: TransactionType;
  categoryId!: string;
  description?: string;
}

export const updateTransactionSchema = z.object({
  amount: z.number().positive('Số tiền phải là số dương').optional(),
  type: z.nativeEnum(TransactionType).optional(),
  categoryId: z.string().optional(),
  description: z.string().optional(),
});

export class UpdateTransactionDto implements z.infer<
  typeof updateTransactionSchema
> {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  description?: string;
}
