import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import { CronLockService } from './cron-lock.service';

function formatError(err: unknown): { message: string; trace?: string } {
  if (err instanceof Error) {
    return {
      message: err.message || 'Unknown error',
      trace: err.stack,
    };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: 'Unknown non-serializable error' };
  }
}

@Injectable()
export class BillingCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingCron.name);

  private readonly lockName = 'billing_cron';
  private readonly lockOwner = `pid:${process.pid}`;
  private isLeader = false;

  constructor(
    private readonly billingService: BillingService,
    private readonly locks: CronLockService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.isLeader = await this.locks.tryAcquirePersistent(
      this.lockName,
      this.lockOwner,
    );

    if (this.isLeader) {
      this.logger.log('Billing cron lock acquired (leader)');
    } else {
      this.logger.warn('Billing cron lock not acquired (follower)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.isLeader) return;

    try {
      await this.locks.release(this.lockName, this.lockOwner);
      this.logger.log('Billing cron lock released');
    } catch (err: unknown) {
      const { message, trace } = formatError(err);
      this.logger.error(`Billing cron unlock failed: ${message}`, trace);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (!this.isLeader) return;

    try {
      const processed = await this.billingService.runBillingCron();
      this.logger.log(`Billing cron processed ${processed} usage events`);
    } catch (err: unknown) {
      // if crash log the error and continue running the cron
      const { message, trace } = formatError(err);
      this.logger.error(`Billing cron failed: ${message}`, trace);
    }
  }
}
