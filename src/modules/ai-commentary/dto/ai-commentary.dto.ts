import { z } from 'zod';

export const transactionIdParamSchema = z
  .string()
  .trim()
  .min(1, 'Mã giao dịch không hợp lệ');
