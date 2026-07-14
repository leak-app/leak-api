import { z } from 'zod';

export const createGoalSchema = z.object({
  name: z.string().min(1, 'Tên mục tiêu là bắt buộc'),
  targetAmount: z.number().positive('Số tiền mục tiêu phải là số dương'),
  savedAmount: z
    .number()
    .nonnegative('Số tiền đã tích lũy không được là số âm')
    .default(0),
});

export class CreateGoalDto implements z.infer<typeof createGoalSchema> {
  name!: string;
  targetAmount!: number;
  savedAmount!: number;
}

export const updateGoalSchema = z.object({
  name: z.string().optional(),
  targetAmount: z
    .number()
    .positive('Số tiền mục tiêu phải là số dương')
    .optional(),
  savedAmount: z
    .number()
    .nonnegative('Số tiền đã tích lũy không được là số âm')
    .optional(),
});

export class UpdateGoalDto implements z.infer<typeof updateGoalSchema> {
  name?: string;
  targetAmount?: number;
  savedAmount?: number;
}
