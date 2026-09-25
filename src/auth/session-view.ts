import type { SessionModel } from '@/generated/prisma/models';

export type SessionView = {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

/** Keeps enough to recognise a network, not enough to locate a person. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.x.x`;
  }
  const groups = ip.split(':');
  if (groups.length < 8) return ip; // loopback or compressed form: nothing identifying to hide
  return [...groups.slice(0, 4), 'x', 'x', 'x', 'x'].join(':');
}

/** Builds the public view field by field, so the token can never leak through a spread. */
export function toSessionView(
  row: SessionModel,
  currentHash: string | null,
): SessionView {
  return {
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: maskIp(row.ipAddress),
    lastActiveAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    isCurrent: currentHash !== null && row.token === currentHash,
  };
}
