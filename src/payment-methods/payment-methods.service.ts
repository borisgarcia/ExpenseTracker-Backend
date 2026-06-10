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
}

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

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
      },
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
      },
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

    // Rebuild label
    const merged = { ...method, ...dto };
    updatedData.label = this.buildLabel(merged as any, method.type);

    return this.prisma.paymentMethod.update({ where: { id }, data: updatedData });
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

    return this.prisma.paymentMethod.update({ where: { id }, data: { isDefault: true } });
  }
}
