import { z } from 'zod';
import { AccountType } from '@/generated/prisma/client';

export const createWalletSchema = z.object({
  name: z.string().min(1, 'Tên ví là bắt buộc'),
  type: z.nativeEnum(AccountType),
  initialBalance: z.number().default(0),
});

export class CreateWalletDto implements z.infer<typeof createWalletSchema> {
  name!: string;
  type!: AccountType;
  initialBalance!: number;
}

export const updateWalletSchema = z.object({
  name: z.string().min(1, 'Tên ví là bắt buộc').optional(),
  initialBalance: z.number().optional(),
});

export class UpdateWalletDto implements z.infer<typeof updateWalletSchema> {
  name?: string;
  initialBalance?: number;
}
