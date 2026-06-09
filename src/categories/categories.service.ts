import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    // Returns system categories (userId is null) AND user's custom categories
    return this.prisma.category.findMany({
      where: {
        OR: [
          { userId: null },
          { userId },
        ],
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async create(userId: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new BadRequestException('Category name cannot be empty');
    }

    // Check if the user already has a category with this name (case-insensitive check is best, but Prisma sqlite/pg behaves differently, so we'll do case-insensitive manually or standard unique query)
    const existing = await this.prisma.category.findFirst({
      where: {
        name: {
          equals: cleanName,
          mode: 'insensitive',
        },
        OR: [
          { userId: null },
          { userId },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException(`Category "${cleanName}" already exists`);
    }

    return this.prisma.category.create({
      data: {
        name: cleanName,
        userId,
      },
    });
  }

  async update(userId: string, id: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new BadRequestException('Category name cannot be empty');
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.userId) {
      throw new ForbiddenException('Cannot edit a system category');
    }

    if (category.userId !== userId) {
      throw new ForbiddenException('You do not have permission to edit this category');
    }

    const duplicate = await this.prisma.category.findFirst({
      where: {
        id: { not: id },
        name: {
          equals: cleanName,
          mode: 'insensitive',
        },
        OR: [
          { userId: null },
          { userId },
        ],
      },
    });

    if (duplicate) {
      throw new BadRequestException(`Category "${cleanName}" already exists`);
    }

    return this.prisma.category.update({
      where: { id },
      data: { name: cleanName },
    });
  }

  async remove(userId: string, id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if it's a global category
    if (!category.userId) {
      throw new ForbiddenException('Cannot delete a system category');
    }

    // Check ownership
    if (category.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this category');
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }
}
