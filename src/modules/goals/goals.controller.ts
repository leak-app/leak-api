import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { GoalService } from './goals.service';
import {
  CreateGoalDto,
  createGoalSchema,
  GoalContributionsQueryDto,
  goalContributionsQuerySchema,
  GoalMovementDto,
  goalMovementSchema,
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

  @Post(':id/deposit')
  @UsePipes(new ZodValidationPipe(goalMovementSchema))
  async deposit(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: GoalMovementDto,
  ) {
    return this._goalService.deposit(user.id, id, dto);
  }

  @Post(':id/withdraw')
  @UsePipes(new ZodValidationPipe(goalMovementSchema))
  async withdraw(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() dto: GoalMovementDto,
  ) {
    return this._goalService.withdraw(user.id, id, dto);
  }

  @Get(':id/contributions')
  async contributions(
    @GetUser() user: User,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(goalContributionsQuerySchema, 'query'))
    query: GoalContributionsQueryDto,
  ) {
    return this._goalService.contributions(user.id, id, query);
  }
}
