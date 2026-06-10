import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  private readonly exchangeRates: Record<string, number> = {
    USD: 1.0,
    HNL: 0.0405,
    EUR: 1.08,
    MXN: 0.055,
    JPY: 0.0064,
  };

  private convertAmount(val: number, from: string, to: string): number {
    const fromRate = this.exchangeRates[from] ?? 1.0;
    const toRate = this.exchangeRates[to] ?? 1.0;
    return (val * fromRate) / toRate;
  }

  private get includeRelations() {
    return {
      category: { select: { id: true, name: true } },
      paymentMethodRef: {
        select: {
          id: true, type: true, label: true, bank: true,
          network: true, lastFour: true, color: true, balance: true,
          currency: true, linkedAccountId: true,
        },
      },
    };
  }

  private async adjustPaymentMethodBalance(
    userId: string,
    paymentMethodId: string | null,
    amount: number, // positive to apply expense, negative to revert/refund expense
    expenseCurrency: string,
  ) {
    if (!paymentMethodId) return;

    const pm = await this.prisma.paymentMethod.findUnique({
      where: { id: paymentMethodId },
    });
    if (!pm || pm.userId !== userId) return;

    if (pm.type === 'CREDIT_CARD') {
      // CREDIT_CARD used balance increases when an expense is made
      const converted = this.convertAmount(amount, expenseCurrency, pm.currency);
      await this.prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { balance: { increment: converted } },
      });
    } else if (pm.type === 'BANK_ACCOUNT') {
      // BANK_ACCOUNT funds decrease when an expense is made
      const converted = this.convertAmount(amount, expenseCurrency, pm.currency);
      await this.prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { balance: { decrement: converted } },
      });
    } else if (pm.type === 'DEBIT_CARD') {
      // DEBIT_CARD deducts from the linked BANK_ACCOUNT
      if (pm.linkedAccountId) {
        const linkedBank = await this.prisma.paymentMethod.findUnique({
          where: { id: pm.linkedAccountId },
        });
        if (linkedBank) {
          const converted = this.convertAmount(amount, expenseCurrency, linkedBank.currency);
          await this.prisma.paymentMethod.update({
            where: { id: pm.linkedAccountId },
            data: { balance: { decrement: converted } },
          });
        }
      }
    }
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
    const resolvedCurrency = currency || 'USD';

    // 1. Create expense
    const expense = await this.prisma.expense.create({
      data: {
        amount,
        description: description?.trim() || null,
        date: parsedDate,
        userId,
        categoryId,
        paymentMethod: resolvedLabel,
        paymentMethodId: paymentMethodId || null,
        currency: resolvedCurrency,
      },
      include: this.includeRelations,
    });

    // 2. Adjust payment method balances
    if (paymentMethodId) {
      await this.adjustPaymentMethodBalance(userId, paymentMethodId, amount, resolvedCurrency);
    }

    return expense;
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

    const oldExpense = await this.prisma.expense.findUnique({ where: { id } });
    if (!oldExpense) throw new NotFoundException('Expense not found');
    if (oldExpense.userId !== userId) throw new ForbiddenException('You do not have permission to edit this expense');

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

    // 1. Revert impact of old expense on balances
    if (oldExpense.paymentMethodId) {
      await this.adjustPaymentMethodBalance(userId, oldExpense.paymentMethodId, -oldExpense.amount, oldExpense.currency);
    }

    // 2. Perform database update
    const updatedExpense = await this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: this.includeRelations,
    });

    // 3. Apply impact of updated expense on balances
    const newPaymentMethodId = paymentMethodId !== undefined ? paymentMethodId : oldExpense.paymentMethodId;
    const newAmount = amount !== undefined ? amount : oldExpense.amount;
    const newCurrency = currency !== undefined ? currency : oldExpense.currency;

    if (newPaymentMethodId) {
      await this.adjustPaymentMethodBalance(userId, newPaymentMethodId, newAmount, newCurrency);
    }

    return updatedExpense;
  }

  async remove(userId: string, id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.userId !== userId) throw new ForbiddenException('You do not have permission to delete this expense');

    // 1. Delete expense
    const deleted = await this.prisma.expense.delete({ where: { id } });

    // 2. Revert impact on balance
    if (expense.paymentMethodId) {
      await this.adjustPaymentMethodBalance(userId, expense.paymentMethodId, -expense.amount, expense.currency);
    }

    return deleted;
  }
}
