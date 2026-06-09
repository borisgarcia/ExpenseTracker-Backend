import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Get()
  async getExpenses(@GetUser('id') userId: string) {
    return this.expensesService.findAll(userId);
  }

  @Post()
  async createExpense(
    @GetUser('id') userId: string,
    @Body() body: { amount: number; description?: string; categoryId: string; date?: string; paymentMethod?: string },
  ) {
    return this.expensesService.create(userId, body);
  }

  @Patch(':id')
  async updateExpense(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { amount?: number; description?: string; categoryId?: string; date?: string; paymentMethod?: string },
  ) {
    return this.expensesService.update(userId, id, body);
  }

  @Delete(':id')
  async deleteExpense(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.expensesService.remove(userId, id);
  }
}
