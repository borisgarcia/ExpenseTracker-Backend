import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private paymentMethodsService: PaymentMethodsService) {}

  @Get()
  async getAll(@GetUser('id') userId: string) {
    return this.paymentMethodsService.findAll(userId);
  }

  @Post()
  async create(
    @GetUser('id') userId: string,
    @Body() body: {
      type: string;
      label?: string;
      bank?: string;
      network?: string;
      lastFour?: string;
      creditLimit?: number;
      cutoffDay?: number;
      color?: string;
      isDefault?: boolean;
    },
  ) {
    return this.paymentMethodsService.create(userId, body);
  }

  @Patch(':id')
  async update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: {
      label?: string;
      bank?: string;
      network?: string;
      lastFour?: string;
      creditLimit?: number;
      cutoffDay?: number;
      color?: string;
      isDefault?: boolean;
    },
  ) {
    return this.paymentMethodsService.update(userId, id, body);
  }

  @Delete(':id')
  async remove(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentMethodsService.remove(userId, id);
  }

  @Post(':id/set-default')
  async setDefault(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentMethodsService.setDefault(userId, id);
  }
}
