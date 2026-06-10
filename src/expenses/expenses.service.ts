import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  private get includeRelations() {
    return {
      category: { select: { id: true, name: true } },
      paymentMethodRef: {
        select: {
          id: true, type: true, label: true, bank: true,
          network: true, lastFour: true, color: true,
        },
      },
    };
  }

  async findAll(userId: string) {
    return this.prisma.expense.findMany({
      where: { userId },
      include: this.includeRelations,
      orderBy: { date: 'desc' },
    });
  }

  async create(
    userId: string,
    data: {
      amount: number;
      description?: string;
      categoryId: string;
      date?: string;
      paymentMethod?: string;
      paymentMethodId?: string;
      currency?: string;
    },
  ) {
    const { amount, description, categoryId, date, paymentMethod, paymentMethodId, currency } = data;

    if (amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than 0');
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.userId && category.userId !== userId) {
      throw new ForbiddenException('You do not have access to this category');
    }

    // Resolve paymentMethod label from relation if paymentMethodId given
    let resolvedLabel = paymentMethod || 'Cash';
    if (paymentMethodId) {
      const pm = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
      if (!pm || pm.userId !== userId) throw new NotFoundException('Payment method not found');
      resolvedLabel = pm.label;
    }

    const parsedDate = date ? new Date(date) : new Date();

    return this.prisma.expense.create({
      data: {
        amount,
        description: description?.trim() || null,
        date: parsedDate,
        userId,
        categoryId,
        paymentMethod: resolvedLabel,
        paymentMethodId: paymentMethodId || null,
        currency: currency || 'USD',
      },
      include: this.includeRelations,
    });
  }

  async update(
    userId: string,
    id: string,
    data: {
      amount?: number;
      description?: string;
      categoryId?: string;
      date?: string;
      paymentMethod?: string;
      paymentMethodId?: string;
      currency?: string;
    },
  ) {
    const { amount, description, categoryId, date, paymentMethod, paymentMethodId, currency } = data;

    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.userId !== userId) throw new ForbiddenException('You do not have permission to edit this expense');

    const updateData: any = {};

    if (amount !== undefined) {
      if (amount <= 0) throw new BadRequestException('Expense amount must be greater than 0');
      updateData.amount = amount;
    }

    if (description !== undefined) updateData.description = description?.trim() || null;

    if (categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Category not found');
      if (category.userId && category.userId !== userId) throw new ForbiddenException('You do not have access to this category');
      updateData.categoryId = categoryId;
    }

    if (date !== undefined) updateData.date = new Date(date);
    if (currency !== undefined) updateData.currency = currency;

    if (paymentMethodId !== undefined) {
      if (paymentMethodId) {
        const pm = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
        if (!pm || pm.userId !== userId) throw new NotFoundException('Payment method not found');
        updateData.paymentMethodId = paymentMethodId;
        updateData.paymentMethod = pm.label;
      } else {
        updateData.paymentMethodId = null;
      }
    } else if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod;
    }

    return this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: this.includeRelations,
    });
  }

  async remove(userId: string, id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.userId !== userId) throw new ForbiddenException('You do not have permission to delete this expense');
    return this.prisma.expense.delete({ where: { id } });
  }
}
