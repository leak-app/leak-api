import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { GoalService } from './goals.service';
import {
  CreateGoalDto,
  createGoalSchema,
  UpdateGoalDto,
  updateGoalSchema,
} from './dto/goals.dto';

@Controller('goals')
export class GoalController {
  constructor(private readonly _goalService: GoalService) {}

  @Get()
  async getGoals(@GetUser() user: User) {
    return this._goalService.findAll(user.id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createGoalSchema))
  async createGoal(@GetUser() user: User, @Body() dto: CreateGoalDto) {
    return this._goalService.create(user.id, dto);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateGoalSchema))
  async updateGoal(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this._goalService.update(user.id, id, dto);
  }

  @Delete(':id')
  async deleteGoal(@GetUser() user: User, @Param('id') id: string) {
    return this._goalService.delete(user.id, id);
  }
}
