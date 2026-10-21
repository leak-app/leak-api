import { z } from 'zod';
import { BuddyMode } from '@/generated/prisma/client';

export const updatePreferencesSchema = z.strictObject({
  buddyMode: z.nativeEnum(BuddyMode, {
    message: 'Chế độ Bạn thân AI không hợp lệ',
  }),
});

export class UpdatePreferencesDto implements z.infer<
  typeof updatePreferencesSchema
> {
  buddyMode!: BuddyMode;
}
