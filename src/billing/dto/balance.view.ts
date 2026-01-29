import { UsageEventView } from './usage-event.view';

export type BalanceView = {
  customerId: string;
  balanceCents: number;
  hasFunds: boolean;
  usageDetails: UsageEventView[];
};
