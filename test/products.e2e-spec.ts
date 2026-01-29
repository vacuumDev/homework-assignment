import request from 'supertest';
import { createE2eContext, resetDatabase } from './e2e-utils';

describe('products (e2e)', () => {
  const ctxPromise = createE2eContext('products');

  beforeEach(async () => {
    const { prisma } = await ctxPromise;
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    const { app } = await ctxPromise;
    await app.close();
  });

  it('GET /products returns products sorted by name', async () => {
    const { app, prisma } = await ctxPromise;

    await prisma.product.createMany({
      data: [
        { name: 'Video Processing', unitPriceCents: 25 },
        { name: 'API Call', unitPriceCents: 1 },
        { name: 'Image Processing', unitPriceCents: 10 },
      ],
    });

    const res = await request(app.getHttpServer()).get('/products').expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({ name: 'API Call', unitPriceCents: 1 }),
      expect.objectContaining({ name: 'Image Processing', unitPriceCents: 10 }),
      expect.objectContaining({ name: 'Video Processing', unitPriceCents: 25 }),
    ]);
  });
});
