import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { SubmitUsageDto } from './dto/submit-usage.dto';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { BalanceView } from './dto/balance.view';
import { CreditResultView } from './dto/credit-result.view';
import { UsageEventView } from './dto/usage-event.view';
import {
  LedgerEntryType,
  LedgerSourceType,
} from '../../prisma/generated/prisma/client';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly products: ProductsService,
  ) {}

  async submitUsage(dto: SubmitUsageDto): Promise<UsageEventView> {
    const { customerId, productId, units } = dto;

    await this.customers.getOrThrow(customerId);
    await this.customers.getWalletOrThrow(customerId);

    const product = await this.products.getOrThrow(productId);

    // create usage event with snapshot price in case of product price change
    const usageEvent = await this.prisma.usageEvent.create({
      data: {
        customerId,
        productId,
        units,
        unitPriceCents: product.unitPriceCents,
        billedAt: null,
      },
      select: {
        id: true,
        productId: true,
        units: true,
        unitPriceCents: true,
        createdAt: true,
        billedAt: true,
      },
    });

    return usageEvent;
  }

  async creditWallet(
    dto: CreditWalletDto,
    idempotencyKey?: string,
  ): Promise<CreditResultView> {
    const { customerId, amountCents } = dto;

    await this.customers.getOrThrow(customerId);
    const wallet = await this.customers.getWalletOrThrow(customerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const normalizedIdempotencyKey =
        typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0
          ? idempotencyKey.trim()
          : null;

      if (normalizedIdempotencyKey) {
        const existing = await tx.ledgerEntry.findUnique({
          where: {
            walletId_idempotencyKey: {
              walletId: wallet.id,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
          select: { amountCents: true, entryType: true },
        });

        if (existing) {
          // Proper idempotency: same key + same request -> return same result.
          if (
            existing.entryType === LedgerEntryType.CREDIT &&
            existing.amountCents === amountCents
          ) {
            const current = await tx.wallet.findUniqueOrThrow({
              where: { id: wallet.id },
              select: { balanceCents: true },
            });

            return { balanceCents: current.balanceCents };
          }

          throw new ConflictException(
            'Idempotency-Key already used with different request parameters',
          );
        }
      }

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amountCents,
          entryType: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.WALLET_CREDIT,
          sourceId: null,
          idempotencyKey: normalizedIdempotencyKey ?? undefined,
        },
        select: { id: true },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: amountCents } },
        select: { balanceCents: true },
      });

      return { balanceCents: updatedWallet.balanceCents };
    });

    return result;
  }

  async getBalance(customerId: string): Promise<BalanceView> {
    const customerWithWallet = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        wallet: { select: { balanceCents: true } },
        usage: {
          select: {
            id: true,
            productId: true,
            units: true,
            unitPriceCents: true,
            createdAt: true,
            billedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customerWithWallet) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    if (!customerWithWallet.wallet) {
      throw new NotFoundException(
        `Wallet for customer ${customerId} not found`,
      );
    }

    return {
      customerId,
      balanceCents: customerWithWallet.wallet.balanceCents,
      hasFunds: customerWithWallet.wallet.balanceCents > 0,
      usageDetails: customerWithWallet.usage,
    };
  }

  async runBillingCron(): Promise<number> {
    // customers with pending usage, take only unique customers
    const customers = await this.prisma.usageEvent.findMany({
      where: { billedAt: null },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    if (customers.length === 0) return 0;

    const billedAt = new Date();
    let totalBilled = 0;

    for (const { customerId } of customers) {
      try {
        // ACID pattern for atomicity and consistency
        const billedForCustomer = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { customerId },
          select: { id: true },
        });

        if (!wallet) {
          this.logger.error(
            `Billing cron: wallet missing for customerId=${customerId}`,
          );
          return 0;
        }

        const events = await tx.usageEvent.findMany({
          where: { customerId, billedAt: null },
          select: { id: true, units: true, unitPriceCents: true },
          orderBy: { createdAt: 'asc' },
        });

        if (events.length === 0) return 0;

        const ids = new Array<string>(events.length);
        const idempotencyKeys = new Array<string>(events.length);

        for (let i = 0; i < events.length; i++) {
          const e = events[i];
          ids[i] = e.id;
          idempotencyKeys[i] = `usage:${e.id}`;
        }

        const existing = await tx.ledgerEntry.findMany({
          where: {
            walletId: wallet.id,
            sourceType: LedgerSourceType.USAGE_BILLING,
            idempotencyKey: { in: idempotencyKeys },
          },
          select: { idempotencyKey: true },
        });

        const existingKeys = new Set<string>(
          existing
            .map((x) => x.idempotencyKey)
            .filter((x): x is string => typeof x === 'string'),
        );

        type EventToBill = { readonly id: string; readonly costCents: number };
        const toBill: EventToBill[] = [];
        let totalDebitCents = 0;

        for (const e of events) {
          const key = `usage:${e.id}`;
          if (existingKeys.has(key)) continue;
          const costCents = e.units * e.unitPriceCents;
          toBill.push({ id: e.id, costCents });
          totalDebitCents += costCents;
        }

        if (toBill.length > 0) {
          await tx.ledgerEntry.createMany({
            data: toBill.map((e) => ({
              walletId: wallet.id,
              amountCents: -e.costCents,
              entryType: LedgerEntryType.DEBIT,
              sourceType: LedgerSourceType.USAGE_BILLING,
              sourceId: e.id,
              idempotencyKey: `usage:${e.id}`,
              createdAt: billedAt,
            })),
          });

          // postpaid: negative allowed; keep cache in sync with ledger
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balanceCents: { decrement: totalDebitCents } },
            select: { id: true },
          });
        }

        const updated = await tx.usageEvent.updateMany({
          where: { id: { in: ids }, billedAt: null },
          data: { billedAt },
        });

        // Invariant case if we didn't mark exactly the events we debited for.
        if (updated.count !== ids.length) {
          throw new Error(
            `Billing cron invariant violated for customerId=${customerId} (selected=${ids.length}, billed=${updated.count})`,
          );
        }

        return updated.count;
      });

      totalBilled += billedForCustomer;
      } catch (error) {
        this.logger.error(`Failed to bill customer ${customerId}`, error);
      }
    }

    return totalBilled;
  }
}
