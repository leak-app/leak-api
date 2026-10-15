import { z } from 'zod';
import { rejectUnknownKeys } from '@/common/zod/reject-unknown-keys';

/** Money columns are Decimal(12, 2): about 10 billion. */
const MAX_BALANCE = 9_999_999_999.99;

export const createValuationSchema = z.strictObject(
  {
    balance: z
      .number()
      .min(0, 'Số dư không được âm')
      .max(MAX_BALANCE, 'Số dư vượt quá giới hạn 10 tỷ ₫'),
    /** The wallet balance the client saw; a mismatch means it changed meanwhile. */
    expectedBalance: z.number(),
    valuedAt: z.iso.date().optional(), // today when omitted
    asBaseline: z.boolean().optional(),
  },
  rejectUnknownKeys,
);

export class CreateValuationDto implements z.infer<
  typeof createValuationSchema
> {
  balance!: number;
  expectedBalance!: number;
  valuedAt?: string;
  asBaseline?: boolean;
}

export const portfolioQuerySchema = z.object({
  months: z.coerce
    .number()
    .int('Số tháng phải là số nguyên')
    .min(1, 'Số tháng tối thiểu là 1')
    .max(36, 'Số tháng tối đa là 36')
    .default(12),
});

export class PortfolioQueryDto implements z.infer<typeof portfolioQuerySchema> {
  months!: number;
}
