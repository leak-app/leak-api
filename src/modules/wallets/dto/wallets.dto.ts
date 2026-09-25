import { z } from 'zod';
import { AccountType } from '@/generated/prisma/client';

/**
 * Wallet payloads reject unknown keys: silently dropping e.g. `currentBalance`
 * would hide a client bug, because balances only move through the ledger.
 */
const rejectUnknownKeys = {
  error: (issue: { code?: string; keys?: string[] }) =>
    issue.code === 'unrecognized_keys'
      ? `Trường không hợp lệ: ${issue.keys?.join(', ')}`
      : undefined,
};

export const createWalletSchema = z.strictObject(
  {
    name: z.string().min(1, 'Tên ví là bắt buộc'),
    type: z.nativeEnum(AccountType),
    initialBalance: z.number().default(0),
  },
  rejectUnknownKeys,
);

export class CreateWalletDto implements z.infer<typeof createWalletSchema> {
  name!: string;
  type!: AccountType;
  initialBalance!: number;
}

export const updateWalletSchema = z.strictObject(
  {
    name: z.string().min(1, 'Tên ví là bắt buộc').optional(),
    initialBalance: z.number().optional(),
  },
  rejectUnknownKeys,
);

export class UpdateWalletDto implements z.infer<typeof updateWalletSchema> {
  name?: string;
  initialBalance?: number;
}
