import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionService } from './session.service';
import type { SessionRepository } from './session.repository';
import { hashToken } from './token-hash';

const row = (id: number, token: string) => ({
  id,
  token,
  userId: 'u',
  userAgent: 'UA',
  ipAddress: '1.2.3.4',
  isRevoked: false,
  createdAt: new Date('2026-09-25T00:00:00Z'),
  expiresAt: new Date('2026-10-25T00:00:00Z'),
});

describe('SessionService', () => {
  const current = hashToken('cookie-token');
  let repo: {
    findActiveByUserId: jest.Mock;
    revokeById: jest.Mock;
    revokeAllExcept: jest.Mock;
  };
  let service: SessionService;

  beforeEach(() => {
    repo = {
      findActiveByUserId: jest
        .fn()
        .mockResolvedValue([row(2, 'other'), row(1, current)]),
      revokeById: jest.fn().mockResolvedValue(1),
      revokeAllExcept: jest.fn().mockResolvedValue(3),
    };
    service = new SessionService(repo as unknown as SessionRepository);
  });

  it('lists active sessions with the current one marked and first', async () => {
    const views = await service.list('u', 'cookie-token');
    expect(repo.findActiveByUserId).toHaveBeenCalledWith('u', expect.any(Date));
    expect(views.map((v) => [v.id, v.isCurrent])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('lists without marking when there is no cookie', async () => {
    const views = await service.list('u');
    expect(views.every((v) => !v.isCurrent)).toBe(true);
  });

  it('refuses to revoke the current session', async () => {
    await expect(service.revoke('u', 1, 'cookie-token')).rejects.toThrow(
      new BadRequestException(
        'Không thể đăng xuất phiên hiện tại tại đây. Hãy dùng Đăng xuất.',
      ),
    );
    expect(repo.revokeById).not.toHaveBeenCalled();
  });

  it('revokes another session of the same user', async () => {
    await expect(service.revoke('u', 2, 'cookie-token')).resolves.toEqual({
      revoked: true,
    });
    expect(repo.revokeById).toHaveBeenCalledWith('u', 2);
  });

  it('404 for a missing, foreign or already revoked id', async () => {
    repo.revokeById.mockResolvedValue(0);
    await expect(service.revoke('u', 99, 'cookie-token')).rejects.toThrow(
      new NotFoundException('Không tìm thấy phiên đăng nhập'),
    );
  });

  it('revokes all others, keeping the current token', async () => {
    await expect(service.revokeOthers('u', 'cookie-token')).resolves.toEqual({
      revokedCount: 3,
    });
    expect(repo.revokeAllExcept).toHaveBeenCalledWith('u', current);
  });

  it('401 and nothing revoked when there is no cookie', async () => {
    await expect(service.revokeOthers('u', undefined)).rejects.toThrow(
      new UnauthorizedException('Thiếu refresh token'),
    );
    expect(repo.revokeAllExcept).not.toHaveBeenCalled();
  });
});
