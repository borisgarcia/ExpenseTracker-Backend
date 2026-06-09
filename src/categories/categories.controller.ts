import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  async getCategories(@GetUser('id') userId: string) {
    return this.categoriesService.findAll(userId);
  }

  @Post()
  async createCategory(
    @GetUser('id') userId: string,
    @Body('name') name: string,
  ) {
    return this.categoriesService.create(userId, name);
  }

  @Patch(':id')
  async updateCategory(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.categoriesService.update(userId, id, name);
  }

  @Delete(':id')
  async deleteCategory(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.categoriesService.remove(userId, id);
  }
}
