import { z } from 'zod';

export const parseQuickLogSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập nội dung giao dịch')
    .max(200, 'Nội dung giao dịch quá dài'),
});

export class ParseQuickLogDto implements z.infer<typeof parseQuickLogSchema> {
  text!: string;
}
