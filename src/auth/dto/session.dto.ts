import { z } from 'zod';

export const sessionIdParamSchema = z.coerce
  .number({ message: 'Mã phiên không hợp lệ' })
  .int('Mã phiên không hợp lệ')
  .positive('Mã phiên không hợp lệ');
