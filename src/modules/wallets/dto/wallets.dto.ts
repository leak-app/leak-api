import { z } from 'zod';
import { AccountType } from '@/generated/prisma/client';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

/**
 * Wallet payloads reject unknown keys: silently dropping e.g. `currentBalance`
 * would hide a client bug, because balances only move through the ledger.
 */
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
