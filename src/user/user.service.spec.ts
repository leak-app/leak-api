import { NotFoundException } from '@nestjs/common';
import { BuddyMode } from '@/generated/prisma/client';
import type { UserRepository } from './user.repository';
import { UserService } from './user.service';

describe('UserService preferences', () => {
  let repository: { findById: jest.Mock; update: jest.Mock };
  let service: UserService;

  beforeEach(() => {
    repository = { findById: jest.fn(), update: jest.fn() };
    service = new UserService(repository as unknown as UserRepository);
  });

  it('returns only the preference, never the rest of the user row', async () => {
    repository.findById.mockResolvedValue({
      id: 'u1',
      password: 'hash',
      email: 'a@b.c',
      buddyMode: BuddyMode.GENTLE,
    });
    await expect(service.getPreferences('u1')).resolves.toEqual({
      buddyMode: BuddyMode.GENTLE,
    });
  });

  it('refuses a user that no longer exists', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.getPreferences('u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('saves the mode and returns only the preference', async () => {
    repository.update.mockResolvedValue({
      id: 'u1',
      password: 'hash',
      buddyMode: BuddyMode.MUTE,
    });

    await expect(
      service.updatePreferences('u1', { buddyMode: BuddyMode.MUTE }),
    ).resolves.toEqual({ buddyMode: BuddyMode.MUTE });
    expect(repository.update).toHaveBeenCalledWith('u1', {
      buddyMode: BuddyMode.MUTE,
    });
  });
});
