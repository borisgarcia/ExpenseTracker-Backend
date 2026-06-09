import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (authHeader === 'Bearer mock-token-12345') {
      // Find or create the demo user in the DB
      let user = await this.prisma.user.findUnique({
        where: { email: 'demo@expensetracker.com' },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: 'demo@expensetracker.com',
            name: 'Usuario Demo',
            password: '',
          },
        });
      }

      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
      };
      return true;
    }

    const result = await super.canActivate(context);
    return result as boolean;
  }
}
