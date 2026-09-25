import { z } from 'zod';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

const goalFields = {
  name: z.string().trim().min(1, 'Tên mục tiêu là bắt buộc').max(60),
  emoji: z.string().max(8).optional(),
  targetAmount: z.number().positive('Số tiền mục tiêu phải là số dương'),
};

// savedAmount is not accepted: it only moves through deposits and withdrawals.
export const createGoalSchema = z.strictObject(
  { ...goalFields, targetDate: z.iso.date().optional() },
  rejectUnknownKeys,
);

export class CreateGoalDto implements z.infer<typeof createGoalSchema> {
  name!: string;
  emoji?: string;
  targetAmount!: number;
  targetDate?: string;
}

export const updateGoalSchema = z.strictObject(
  {
    name: goalFields.name.optional(),
    emoji: goalFields.emoji,
    targetAmount: goalFields.targetAmount.optional(),
    targetDate: z.iso.date().nullable().optional(), // null clears it
  },
  rejectUnknownKeys,
);

export class UpdateGoalDto implements z.infer<typeof updateGoalSchema> {
  name?: string;
  emoji?: string;
  targetAmount?: number;
  targetDate?: string | null;
}

export const goalMovementSchema = z.strictObject(
  {
    amount: z.number().positive('Số tiền phải là số dương'),
    accountId: z.string().min(1).optional(), // default wallet when omitted
    note: z.string().max(120).optional(),
  },
  rejectUnknownKeys,
);

export class GoalMovementDto implements z.infer<typeof goalMovementSchema> {
  amount!: number;
  accountId?: string;
  note?: string;
}

export const goalContributionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class GoalContributionsQueryDto implements z.infer<
  typeof goalContributionsQuerySchema
> {
  page!: number;
  limit!: number;
}
