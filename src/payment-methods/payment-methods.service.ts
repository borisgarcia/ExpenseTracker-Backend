import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePaymentMethodDto {
  type: string;
  label?: string;
  bank?: string;
  network?: string;
  lastFour?: string;
  creditLimit?: number;
  cutoffDay?: number;
  color?: string;
  isDefault?: boolean;
  balance?: number;
  currency?: string;
  linkedAccountId?: string;
}

export interface UpdatePaymentMethodDto {
  label?: string;
  bank?: string;
  network?: string;
  lastFour?: string;
  creditLimit?: number;
  cutoffDay?: number;
  color?: string;
  isDefault?: boolean;
  balance?: number;
  currency?: string;
  linkedAccountId?: string;
}

@Injectable()
export class PaymentMethodsService {
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
      linkedAccount: {
        select: {
          id: true,
          type: true,
          label: true,
          balance: true,
          currency: true,
        },
      },
    };
  }

  /**
   * Build a display label from type + network + lastFour, or use custom label.
   */
  private buildLabel(dto: CreatePaymentMethodDto | UpdatePaymentMethodDto, type?: string): string {
    if ((dto as any).label?.trim()) return (dto as any).label.trim();

    const resolvedType = type ?? (dto as CreatePaymentMethodDto).type;

    if (resolvedType === 'CASH') return 'Cash';

    const networkMap: Record<string, string> = {
      VISA: 'Visa',
      MASTERCARD: 'Mastercard',
      AMEX: 'Amex',
      DISCOVER: 'Discover',
      OTHER: 'Card',
    };
    const networkLabel = (dto as any).network ? (networkMap[(dto as any).network] ?? 'Card') : 'Card';

    if (resolvedType === 'BANK_ACCOUNT') {
      const bank = (dto as any).bank ? (dto as any).bank.trim() : 'Bank';
      return `${bank} Account`;
    }

    const last = (dto as any).lastFour ? ` ···${(dto as any).lastFour}` : '';
    return `${networkLabel}${last}`;
  }

  async findAll(userId: string) {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { userId, isArchived: false },
      include: this.includeRelations,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // Ensure Cash always exists
    if (!methods.find((m) => m.type === 'CASH')) {
      const cash = await this.ensureCash(userId);
      return [cash, ...methods];
    }
    return methods;
  }

  async ensureCash(userId: string) {
    const existing = await this.prisma.paymentMethod.findFirst({
      where: { userId, type: 'CASH' },
      include: this.includeRelations,
    });
    if (existing) return existing;

    // Check if this is the user's very first payment method → make it default
    const count = await this.prisma.paymentMethod.count({ where: { userId } });
    return this.prisma.paymentMethod.create({
      data: {
        userId,
        type: 'CASH',
        label: 'Cash',
        isDefault: count === 0,
        balance: 0,
        currency: 'USD',
      },
      include: this.includeRelations,
    });
  }

  async create(userId: string, dto: CreatePaymentMethodDto) {
    const type = dto.type?.toUpperCase();
    const validTypes = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_ACCOUNT'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Only one CASH allowed per user
    if (type === 'CASH') {
      const existing = await this.prisma.paymentMethod.findFirst({ where: { userId, type: 'CASH' } });
      if (existing) throw new BadRequestException('Cash payment method already exists');
    }

    if (dto.lastFour && !/^\d{4}$/.test(dto.lastFour)) {
      throw new BadRequestException('lastFour must be exactly 4 digits');
    }

    if (dto.cutoffDay !== undefined && (dto.cutoffDay < 1 || dto.cutoffDay > 31)) {
      throw new BadRequestException('cutoffDay must be between 1 and 31');
    }

    // Validate linkedAccountId
    if (type === 'DEBIT_CARD' && dto.linkedAccountId) {
      const linked = await this.prisma.paymentMethod.findUnique({ where: { id: dto.linkedAccountId } });
      if (!linked || linked.userId !== userId) throw new NotFoundException('Linked bank account not found');
      if (linked.type !== 'BANK_ACCOUNT') throw new BadRequestException('Linked account must be a bank account');
    }

    const label = this.buildLabel(dto);

    // If new method is default → clear previous default
    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // First method of user becomes default automatically
    const count = await this.prisma.paymentMethod.count({ where: { userId } });
    const shouldBeDefault = dto.isDefault || count === 0;

    return this.prisma.paymentMethod.create({
      data: {
        userId,
        type,
        label,
        bank: dto.bank?.trim() || null,
        network: dto.network?.toUpperCase() || null,
        lastFour: dto.lastFour || null,
        creditLimit: dto.creditLimit ?? null,
        cutoffDay: dto.cutoffDay ?? null,
        color: dto.color || null,
        isDefault: shouldBeDefault,
        balance: dto.balance ?? 0,
        currency: dto.currency || 'USD',
        linkedAccountId: type === 'DEBIT_CARD' ? dto.linkedAccountId || null : null,
      },
      include: this.includeRelations,
    });
  }

  async update(userId: string, id: string, dto: UpdatePaymentMethodDto) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Payment method not found');
    if (method.userId !== userId) throw new ForbiddenException('Not your payment method');
    if (method.isArchived) throw new BadRequestException('Cannot edit an archived payment method');

    if (dto.lastFour && !/^\d{4}$/.test(dto.lastFour)) {
      throw new BadRequestException('lastFour must be exactly 4 digits');
    }

    if (dto.cutoffDay !== undefined && (dto.cutoffDay < 1 || dto.cutoffDay > 31)) {
      throw new BadRequestException('cutoffDay must be between 1 and 31');
    }

    // Validate linkedAccountId if it's DEBIT_CARD
    if (method.type === 'DEBIT_CARD' && dto.linkedAccountId !== undefined) {
      if (dto.linkedAccountId) {
        const linked = await this.prisma.paymentMethod.findUnique({ where: { id: dto.linkedAccountId } });
        if (!linked || linked.userId !== userId) throw new NotFoundException('Linked bank account not found');
        if (linked.type !== 'BANK_ACCOUNT') throw new BadRequestException('Linked account must be a bank account');
      }
    }

    // If setting as default → clear previous default
    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updatedData: any = {};
    if (dto.bank !== undefined) updatedData.bank = dto.bank?.trim() || null;
    if (dto.network !== undefined) updatedData.network = dto.network?.toUpperCase() || null;
    if (dto.lastFour !== undefined) updatedData.lastFour = dto.lastFour || null;
    if (dto.creditLimit !== undefined) updatedData.creditLimit = dto.creditLimit;
    if (dto.cutoffDay !== undefined) updatedData.cutoffDay = dto.cutoffDay;
    if (dto.color !== undefined) updatedData.color = dto.color;
    if (dto.isDefault !== undefined) updatedData.isDefault = dto.isDefault;
    if (dto.balance !== undefined) updatedData.balance = dto.balance;
    if (dto.currency !== undefined) updatedData.currency = dto.currency;
    if (method.type === 'DEBIT_CARD' && dto.linkedAccountId !== undefined) {
      updatedData.linkedAccountId = dto.linkedAccountId || null;
    }

    // Rebuild label
    const merged = { ...method, ...dto };
    updatedData.label = this.buildLabel(merged as any, method.type);

    return this.prisma.paymentMethod.update({
      where: { id },
      data: updatedData,
      include: this.includeRelations,
    });
  }

  async remove(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Payment method not found');
    if (method.userId !== userId) throw new ForbiddenException('Not your payment method');
    if (method.type === 'CASH') throw new ForbiddenException('Cannot delete the Cash payment method');

    // Soft delete — preserve historical expenses
    const archived = await this.prisma.paymentMethod.update({
      where: { id },
      data: { isArchived: true, isDefault: false },
      include: this.includeRelations,
    });

    // If it was default, promote the first remaining method
    if (method.isDefault) {
      const next = await this.prisma.paymentMethod.findFirst({
        where: { userId, isArchived: false },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.paymentMethod.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    return archived;
  }

  async setDefault(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Payment method not found');
    if (method.userId !== userId) throw new ForbiddenException('Not your payment method');
    if (method.isArchived) throw new BadRequestException('Cannot set an archived method as default');

    await this.prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true },
      include: this.includeRelations,
    });
  }

  async payCard(userId: string, id: string, fromBankAccountId?: string) {
    const card = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('Payment method not found');
    if (card.userId !== userId) throw new ForbiddenException('Not your card');
    if (card.type !== 'CREDIT_CARD') throw new BadRequestException('Only credit cards can be paid');

    const usedAmount = card.balance;
    if (usedAmount <= 0) {
      // Just clear balance to 0 (no actual payment needed)
      return this.prisma.paymentMethod.update({
        where: { id },
        data: { balance: 0 },
        include: this.includeRelations,
      });
    }

    if (fromBankAccountId) {
      const bank = await this.prisma.paymentMethod.findUnique({ where: { id: fromBankAccountId } });
      if (!bank || bank.userId !== userId) throw new NotFoundException('Source bank account not found');
      if (bank.type !== 'BANK_ACCOUNT') throw new BadRequestException('Source account must be a bank account');

      // Convert card's used balance to bank's currency
      const convertedPayment = this.convertAmount(usedAmount, card.currency, bank.currency);

      // Deduct from bank account balance
      await this.prisma.paymentMethod.update({
        where: { id: fromBankAccountId },
        data: { balance: { decrement: convertedPayment } },
      });
    }

    // Reset card balance to 0
    return this.prisma.paymentMethod.update({
      where: { id },
      data: { balance: 0 },
      include: this.includeRelations,
    });
  }
}
