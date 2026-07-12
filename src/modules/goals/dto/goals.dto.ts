import { z } from 'zod';

export const createGoalSchema = z.object({
  name: z.string().min(1, 'Goal name is required'),
  targetAmount: z.number().positive('Target amount must be positive'),
  savedAmount: z.number().nonnegative('Saved amount cannot be negative').default(0),
});

export class CreateGoalDto implements z.infer<typeof createGoalSchema> {
  name!: string;
  targetAmount!: number;
  savedAmount!: number;
}

export const updateGoalSchema = z.object({
  name: z.string().optional(),
  targetAmount: z.number().positive('Target amount must be positive').optional(),
  savedAmount: z.number().nonnegative('Saved amount cannot be negative').optional(),
});

export class UpdateGoalDto implements z.infer<typeof updateGoalSchema> {
  name?: string;
  targetAmount?: number;
  savedAmount?: number;
}
