import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

type SeedCustomer = {
  id: string;
  name: string;
};

async function main() {
  console.log('🌱 Seeding database...');

  // --- cleanup ---
  await prisma.walletCredit.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();

  // --- products ---
  await prisma.product.createMany({
    data: [
      { name: 'API Call', unitPriceCents: 1 },
      { name: 'Image Processing', unitPriceCents: 10 },
      { name: 'Video Processing', unitPriceCents: 25 },
    ],
  });

  const products = await prisma.product.findMany();

  // --- customers + wallets ---
  const customers: SeedCustomer[] = [];

  for (let i = 1; i <= 10; i++) {
    const initialBalanceCents = i * 100;

    const customer = await prisma.$transaction(async (tx) => {
      const createdCustomer = await tx.customer.create({
        data: {
          name: `Customer ${i}`,
          wallet: {
            // Keep aggregate balance consistent with the credit ledger.
            create: { balanceCents: 0 },
          },
        },
      });

      const wallet = await tx.wallet.findUnique({
        where: { customerId: createdCustomer.id },
        select: { id: true },
      });

      if (!wallet) {
        throw new Error(
          `Wallet not found right after creation for customerId=${createdCustomer.id}`,
        );
      }

      if (initialBalanceCents > 0) {
        await tx.walletCredit.create({
          data: {
            walletId: wallet.id,
            amountCents: initialBalanceCents,
          },
        });

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { increment: initialBalanceCents } },
        });
      }

      return createdCustomer;
    });

    customers.push(customer);
  }

  // --- usage events ---
  for (const customer of customers) {
    for (let i = 0; i < 5; i++) {
      const product = products[i % products.length];

      await prisma.usageEvent.create({
        data: {
          customerId: customer.id,
          productId: product.id,
          units: (i + 1) * 10,
          unitPriceCents: product.unitPriceCents, // snapshot of a price if the product price changes
          billedAt: null, // always pending; cron is responsible for billing
        },
      });
    }
  }

  console.log('✅ Seed completed successfully');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
