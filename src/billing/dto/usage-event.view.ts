export type UsageEventView = {
  id: string;
  productId: string;
  units: number;
  unitPriceCents: number;
  createdAt: Date;
  billedAt: Date | null;
};
