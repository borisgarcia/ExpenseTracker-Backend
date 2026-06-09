import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private client: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async verifyGoogleToken(token: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Token de Google inválido');
      }
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Fallo la verificación de Google');
    }
  }

  async loginWithGoogle(token: string) {
    const payload = await this.verifyGoogleToken(token);
    
    const email = payload.email;
    if (!email) {
      throw new UnauthorizedException('No se recibió el email de Google');
    }

    // Find or create user in our Postgres database
    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: payload.name || '',
          password: '', // OAuth users do not use a standard password
        },
      });
    }

    const jwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(jwtPayload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: payload.picture,
      },
    };
  }
}
