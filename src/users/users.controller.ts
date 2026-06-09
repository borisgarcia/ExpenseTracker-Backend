import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getProfile(@GetUser('id') userId: string) {
    return this.usersService.findUserProfile(userId);
  }

  @Patch('me')
  async updateProfile(
    @GetUser('id') userId: string,
    @Body('monthlyBudget') monthlyBudget: number,
  ) {
    return this.usersService.updateProfile(userId, { monthlyBudget });
  }
}
