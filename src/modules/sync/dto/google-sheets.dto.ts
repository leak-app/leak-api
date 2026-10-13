import { z } from 'zod';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

export const toggleSheetsSyncSchema = z.strictObject(
  { enabled: z.boolean() },
  rejectUnknownKeys,
);

export class ToggleSheetsSyncDto implements z.infer<
  typeof toggleSheetsSyncSchema
> {
  enabled!: boolean;
}

/**
 * Google appends extra params (scope, authuser, prompt, hd), so this schema must not be strict.
 */
export const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export class CallbackQueryDto implements z.infer<typeof callbackQuerySchema> {
  code?: string;
  state?: string;
  error?: string;
}
