import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.expense.findMany({
      where: { userId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  async create(userId: string, data: { amount: number; description?: string; categoryId: string; date?: string; paymentMethod?: string }) {
    const { amount, description, categoryId, date, paymentMethod } = data;

    if (amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than 0');
    }

    // Verify category exists and is either global (userId is null) or belongs to the user
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.userId && category.userId !== userId) {
      throw new ForbiddenException('You do not have access to this category');
    }

    // Convert date string to Date object or default to current date
    const parsedDate = date ? new Date(date) : new Date();

    return this.prisma.expense.create({
      data: {
        amount,
        description: description?.trim() || null,
        date: parsedDate,
        userId,
        categoryId,
        paymentMethod: paymentMethod || 'Cash',
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async update(
    userId: string,
    id: string,
    data: { amount?: number; description?: string; categoryId?: string; date?: string; paymentMethod?: string },
  ) {
    const { amount, description, categoryId, date, paymentMethod } = data;

    const expense = await this.prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (expense.userId !== userId) {
      throw new ForbiddenException('You do not have permission to edit this expense');
    }

    const updateData: any = {};

    if (amount !== undefined) {
      if (amount <= 0) {
        throw new BadRequestException('Expense amount must be greater than 0');
      }
      updateData.amount = amount;
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      if (category.userId && category.userId !== userId) {
        throw new ForbiddenException('You do not have access to this category');
      }

      updateData.categoryId = categoryId;
    }

    if (date !== undefined) {
      updateData.date = new Date(date);
    }

    if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod;
    }

    return this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(userId: string, id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (expense.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this expense');
    }

    return this.prisma.expense.delete({
      where: { id },
    });
  }
}
