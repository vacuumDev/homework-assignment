# Usage-based Billing (NestJS + Prisma + SQLite)

Homework backend service implementing a **postpaid, usage-based billing** model (ledger-style):

- Usage events are always recorded.
- Billing is asynchronous and performed by a cron job (runs every minute).
- Source of truth is the append-only ledger: `LedgerEntry` (with `Wallet.balanceCents` as a transactional cache).
- Wallet balances can go negative.

- **Ledger invariant**: `Wallet.balanceCents` is a cache and must always equal `SUM(LedgerEntry.amountCents)` for a wallet. This repo has an e2e test enforcing it.
- **Idempotency**:
  - `POST /billing/credit` supports the optional `Idempotency-Key` header. Repeating the same request with the same key returns the same result without duplicating ledger entries. Reusing a key with different parameters returns `409`.
  - The billing cron uses deterministic idempotency keys per usage event (e.g. `usage:<usageEventId>`) to avoid duplicate debits.
- **Cron locking**:
  - This repo uses a simple persistent DB lock (leader election) for the cron runner.


## Tech stack

- Node.js + TypeScript
- NestJS
- Prisma
- SQLite (single instance, single cron runner)

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Set `DATABASE_URL` as a SQLite `file:` URL.

Examples:

```bash
# relative path
DATABASE_URL="file:./dev.db"
```

You can put it into a local `.env` file (not committed) or export it in your shell.

### 3) Run migrations and seed

```bash
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

The seed creates:

- 3 products with different unit prices
- 10 customers with random wallet balances (1..1000 cents, represented as a `WalletCredit` entry)
- usage events (all pending; the cron will bill them)

### 4) Start the app in the dev environment

```bash
npm run start:dev
```

The server listens on port 3000.

## API

### Submit usage

`POST /billing/usage`

Body:

```json
{ "customerId": "uuid", "productId": "uuid", "units": 10 }
```

Notes:

- Validates customer and product existence
- Stores `unitPriceCents` as a **snapshot** at submission time

Example:

```bash
curl -X POST "http://localhost:3000/billing/usage" \
  -H "content-type: application/json" \
  -d '{"customerId":"...","productId":"...","units":10}'
```

### Credit wallet

`POST /billing/credit`

Body:

```json
{ "customerId": "uuid", "amountCents": 1000 }
```

Example:

```bash
curl -X POST "http://localhost:3000/billing/credit" \
  -H "content-type: application/json" \
  -d '{"customerId":"...","amountCents":1000}'
```

### Get balance

`GET /billing/balance/:customerId`

Returns the current wallet balance (maintained by cron) and usage events.

Example:

```bash
curl "http://localhost:3000/billing/balance/<customerId>"
```

### List products

`GET /products`

Example:

```bash
curl "http://localhost:3000/products"
```

## Billing cron

The cron runs every minute and:

- selects only `UsageEvent` rows with `billedAt IS NULL`
- debits wallet balances based on `units * unitPriceCents` (negative allowed)
- marks those events as billed by setting `billedAt`

## Tests

```bash
# e2e tests
npm run test:e2e
```