import { z } from 'zod';

export const upsertBudgetSchema = z.object({
  categoryId: z.string().min(1, 'Mã danh mục là bắt buộc'),
  amount: z.number().nonnegative('Số tiền ngân sách không được là số âm'),
  month: z
    .number()
    .int()
    .min(1, 'Tháng không hợp lệ')
    .max(12, 'Tháng không hợp lệ'),
  year: z.number().int().min(2000).max(2100),
});

export class UpsertBudgetDto implements z.infer<typeof upsertBudgetSchema> {
  categoryId!: string;
  amount!: number;
  month!: number;
  year!: number;
}

export const queryBudgetSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export class QueryBudgetDto implements z.infer<typeof queryBudgetSchema> {
  month?: number;
  year?: number;
}
