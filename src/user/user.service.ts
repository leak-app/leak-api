import { Injectable, NotFoundException } from '@nestjs/common';
import type { BuddyMode } from '@/generated/prisma/client';
import type { UpdatePreferencesDto } from './dto/preferences.dto';
import { UserRepository } from './user.repository';

export interface UserPreferencesView {
  buddyMode: BuddyMode;
}

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getPreferences(userId: string): Promise<UserPreferencesView> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return { buddyMode: user.buddyMode };
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferencesView> {
    const user = await this.userRepository.update(userId, {
      buddyMode: dto.buddyMode,
    });
    return { buddyMode: user.buddyMode };
  }
}
