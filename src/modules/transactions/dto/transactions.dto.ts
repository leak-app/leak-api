import { z } from 'zod';
import { TransactionType } from '@/generated/prisma/client';

export const createTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  type: z.nativeEnum(TransactionType),
  categoryId: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
});

export class CreateTransactionDto implements z.infer<typeof createTransactionSchema> {
  amount!: number;
  type!: TransactionType;
  categoryId!: string;
  description?: string;
}

export const updateTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  type: z.nativeEnum(TransactionType).optional(),
  categoryId: z.string().optional(),
  description: z.string().optional(),
});

export class UpdateTransactionDto implements z.infer<typeof updateTransactionSchema> {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  description?: string;
}
