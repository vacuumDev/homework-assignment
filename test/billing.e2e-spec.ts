import request from 'supertest';
import { createE2eContext, resetDatabase } from './e2e-utils';
import { BillingService } from '../src/billing/billing.service';

describe('billing (e2e)', () => {
  const ctxPromise = createE2eContext('billing');

  beforeAll(async () => {
    const { prisma } = await ctxPromise;
    await resetDatabase(prisma);
  });

  beforeEach(async () => {
    const { prisma } = await ctxPromise;
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    const { app } = await ctxPromise;
    await app.close();
  });

  it('POST /billing/usage creates usage event with price snapshot', async () => {
    const { app, prisma } = await ctxPromise;

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 0 } } },
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 1 },
    });

    const res1 = await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 10 })
      .expect(201);

    expect(res1.body).toEqual(
      expect.objectContaining({
        productId: product.id,
        units: 10,
        unitPriceCents: 1,
        billedAt: null,
      }),
    );

    await prisma.product.update({
      where: { id: product.id },
      data: { unitPriceCents: 27 },
    });

    const res2 = await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 10 })
      .expect(201);

    expect(res2.body).toEqual(
      expect.objectContaining({
        productId: product.id,
        units: 10,
        unitPriceCents: 27,
        billedAt: null,
      }),
    );

    const balance = await request(app.getHttpServer())
      .get(`/billing/balance/${customer.id}`)
      .expect(200);

    expect(balance.body.usageDetails[0]).toEqual(
      expect.objectContaining({ unitPriceCents: 27 }),
    );
    expect(balance.body.usageDetails[1]).toEqual(
      expect.objectContaining({ unitPriceCents: 1 }),
    );
  });

  it('POST /billing/usage validates units and forbids extra fields', async () => {
    const { app, prisma } = await ctxPromise;

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 0 } } },
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 1 },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 0 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({
        customerId: customer.id,
        productId: product.id,
        units: 1,
        extra: true,
      })
      .expect(400);
  });

  it('POST /billing/usage returns 404 when wallet is missing', async () => {
    const { app, prisma } = await ctxPromise;

    const customer = await prisma.customer.create({
      data: { name: 'C1' }, // without wallet
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 1 },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 1 })
      .expect(404);
  });

  it('POST /billing/credit creates WalletCredit and updates balance', async () => {
    const { app, prisma } = await ctxPromise;

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 0 } } },
      include: { wallet: true },
    });
    const wallet = customer.wallet!;

    const res = await request(app.getHttpServer())
      .post('/billing/credit')
      .send({ customerId: customer.id, amountCents: 100 })
      .expect(201);

    expect(res.body).toEqual({ balanceCents: 100 });

    const creditCount = await prisma.walletCredit.count({
      where: { walletId: wallet.id, amountCents: 100 },
    });
    expect(creditCount).toBe(1);
  });

  it('GET /billing/balance/:customerId returns 404 for missing customer', async () => {
    const { app } = await ctxPromise;

    await request(app.getHttpServer())
      .get('/billing/balance/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('cron bills pending usage and is idempotent', async () => {
    const { app, prisma } = await ctxPromise;
    const billing = app.get(BillingService);

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 1000 } } },
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 27 },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 10 })
      .expect(201);

    const billedCount1 = await billing.runBillingCron();
    expect(billedCount1).toBe(1);

    const walletAfter1 = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customer.id },
      select: { balanceCents: true },
    });
    expect(walletAfter1.balanceCents).toBe(730);

    const billedCount2 = await billing.runBillingCron();
    expect(billedCount2).toBe(0);

    const walletAfter2 = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customer.id },
      select: { balanceCents: true },
    });
    expect(walletAfter2.balanceCents).toBe(730);
  });

  it('cron allows negative wallet balances (postpaid)', async () => {
    const { app, prisma } = await ctxPromise;
    const billing = app.get(BillingService);

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 0 } } },
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 50 },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 3 })
      .expect(201);

    const billedCount = await billing.runBillingCron();
    expect(billedCount).toBe(1);

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customer.id },
      select: { balanceCents: true },
    });
    expect(walletAfter.balanceCents).toBe(-150);
  });

  it('cron debits the sum of multiple pending usage events for a customer', async () => {
    const { app, prisma } = await ctxPromise;
    const billing = app.get(BillingService);

    const customer = await prisma.customer.create({
      data: { name: 'C1', wallet: { create: { balanceCents: 1000 } } },
    });
    const product = await prisma.product.create({
      data: { name: `API Call ${customer.id}`, unitPriceCents: 10 },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 10 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 20 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customer.id, productId: product.id, units: 30 })
      .expect(201);

    const billedCount = await billing.runBillingCron();
    expect(billedCount).toBe(3);

    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customer.id },
      select: { balanceCents: true },
    });
    expect(walletAfter.balanceCents).toBe(400);

    const pending = await prisma.usageEvent.count({
      where: { customerId: customer.id, billedAt: null },
    });
    expect(pending).toBe(0);
  });

  it('cron processes multiple customers in one run', async () => {
    const { app, prisma } = await ctxPromise;
    const billing = app.get(BillingService);

    const product = await prisma.product.create({
      data: { name: 'API Call (shared)', unitPriceCents: 25 },
    });

    const customerA = await prisma.customer.create({
      data: { name: 'A', wallet: { create: { balanceCents: 1000 } } },
    });
    const customerB = await prisma.customer.create({
      data: { name: 'B', wallet: { create: { balanceCents: 200 } } },
    });

    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customerA.id, productId: product.id, units: 4 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customerA.id, productId: product.id, units: 8 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/billing/usage')
      .send({ customerId: customerB.id, productId: product.id, units: 10 })
      .expect(201);

    const billedCount = await billing.runBillingCron();
    expect(billedCount).toBe(3);

    const walletA = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customerA.id },
      select: { balanceCents: true },
    });
    expect(walletA.balanceCents).toBe(700);

    const walletB = await prisma.wallet.findUniqueOrThrow({
      where: { customerId: customerB.id },
      select: { balanceCents: true },
    });
    expect(walletB.balanceCents).toBe(-50);
  });
});
