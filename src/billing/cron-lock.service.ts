import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../prisma/generated/prisma/client';

function isKnownPrismaError(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

@Injectable()
export class CronLockService {
  constructor(private readonly prisma: PrismaService) {}

  async tryAcquirePersistent(name: string, lockedBy: string): Promise<boolean> {
    try {
      await this.prisma.cronLock.create({
        data: { name, lockedBy },
        select: { name: true },
      });
      return true;
    } catch (err: unknown) {
      // lock already exists
      if (isKnownPrismaError(err) && err.code === 'P2002') return false;
      throw err;
    }
  }

  async release(name: string, lockedBy: string): Promise<void> {
    await this.prisma.cronLock.deleteMany({
      where: { name, lockedBy },
    });
  }
}
