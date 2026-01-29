import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Customer, Wallet } from '../../prisma/generated/prisma/client';

type CustomerSummary = Pick<Customer, 'id' | 'name'>;
type WalletSummary = Pick<Wallet, 'id' | 'customerId' | 'balanceCents'>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrThrow(customerId: string): Promise<CustomerSummary> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    return customer;
  }

  async getWalletOrThrow(customerId: string): Promise<WalletSummary> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
      select: {
        id: true,
        customerId: true,
        balanceCents: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException(
        `Wallet for customer ${customerId} not found`,
      );
    }

    return wallet;
  }
}
