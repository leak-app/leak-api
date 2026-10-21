import { Body, Controller, Get, Patch, UsePipes } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import type { User } from '@/generated/prisma/client';
import {
  UpdatePreferencesDto,
  updatePreferencesSchema,
} from './dto/preferences.dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me/preferences')
  getPreferences(@GetUser() user: User) {
    return this.userService.getPreferences(user.id);
  }

  @Patch('me/preferences')
  @UsePipes(new ZodValidationPipe(updatePreferencesSchema))
  updatePreferences(@GetUser() user: User, @Body() dto: UpdatePreferencesDto) {
    return this.userService.updatePreferences(user.id, dto);
  }
}
