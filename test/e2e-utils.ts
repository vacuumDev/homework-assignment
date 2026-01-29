import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export type E2eContext = {
  app: INestApplication;
  prisma: PrismaService;
};

function createDatabaseUrl(testName: string): string {
  const safeName = testName.replace(/[^a-z0-9_-]/gi, '_');
  const fileName = `./test-e2e.${safeName}.${process.pid}.${Date.now()}.db`;
  return `file:${fileName}`;
}

export async function createE2eContext(testName: string): Promise<E2eContext> {
  process.env.DATABASE_URL = createDatabaseUrl(testName);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.init();

  const registry = app.get(SchedulerRegistry);
  for (const job of registry.getCronJobs().values()) {
    job.stop();
  }

  const prisma = app.get(PrismaService);

  return { app, prisma };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // cleanup database
  await prisma.walletCredit.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
}
