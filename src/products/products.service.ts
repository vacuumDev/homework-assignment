import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Product } from '../../prisma/generated/prisma/client';

type ProductSummary = Pick<Product, 'id' | 'name' | 'unitPriceCents'>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProductSummary[]> {
    // simple query to get all products, in real world we need to add pagination with page and pageSize
    return this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        unitPriceCents: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getOrThrow(productId: string): Promise<ProductSummary> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unitPriceCents: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    return product;
  }
}
