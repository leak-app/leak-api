import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { SessionRepository } from './session.repository';
import { toSessionView, type SessionView } from './session-view';
import { hashToken } from './token-hash';

@Injectable()
export class SessionService {
  constructor(private readonly _sessions: SessionRepository) {}

  async list(userId: string, refreshToken?: string): Promise<SessionView[]> {
    const current = refreshToken ? hashToken(refreshToken) : null;
    const rows = await this._sessions.findActiveByUserId(userId, new Date());
    // Current session first, then most recently active (repository order).
    return rows
      .map((row) => toSessionView(row, current))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  }

  async revoke(userId: string, id: number, refreshToken?: string) {
    if (refreshToken) {
      const current = hashToken(refreshToken);
      const rows = await this._sessions.findActiveByUserId(userId, new Date());
      if (rows.some((r) => r.id === id && r.token === current)) {
        throw new BadRequestException(
          'Không thể đăng xuất phiên hiện tại tại đây. Hãy dùng Đăng xuất.',
        );
      }
    }
    const changed = await this._sessions.revokeById(userId, id);
    if (changed === 0) {
      throw new NotFoundException('Không tìm thấy phiên đăng nhập');
    }
    return { revoked: true as const };
  }

  async revokeOthers(userId: string, refreshToken?: string) {
    if (!refreshToken) throw new UnauthorizedException('Thiếu refresh token');
    const revokedCount = await this._sessions.revokeAllExcept(
      userId,
      hashToken(refreshToken),
    );
    return { revokedCount };
  }
}
