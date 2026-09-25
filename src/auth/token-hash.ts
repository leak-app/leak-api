import { createHash } from 'crypto';

/** Refresh tokens are stored hashed; this is the only hashing rule. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
