# System Architecture: Leak App (NestJS Backend)

## 1. Overview

The Leak API is the core engine for the Leak App, providing a high-performance, type-safe REST interface to manage financial data. It ensures data integrity, performs financial calculations, and persists records in a PostgreSQL database via Prisma.

- **Architecture:** Clean Architecture / Modular Monolith.
- **Primary Goal:** Manage accounts, transactions, investments, and savings goals with strict type safety.
- **Database:** PostgreSQL (Relational).
- **ORM:** Prisma.

## 2. Tech Stack

- **Framework:** NestJS (v11+).
- **Language:** TypeScript (Strict mode).
- **Database:** PostgreSQL.
- **ORM:** Prisma ORM.
- **Validation:** Zod.
- **API Style:** RESTful API with standardized JSON responses.

## 3. Data Schema (Prisma)

The backend manages the following entities via Prisma:

- **Accounts:** Tracks financial sources (Bank, Cash, E-wallet). Includes `initialBalance` and `currentBalance`.
- **Transactions:** Records of money movement (In/Out). Linked to an Account and a Category.
- **Categories:** Classification for transactions (e.g., Food, Salary).
- **Investments:** Tracks assets, purchase value, and expected ROI.
- **Goals:** Savings targets with `targetAmount` and `savedAmount` progress.

## 4. API Interface & Contracts

### Standard Response Envelope

All endpoints must return data in this format to sync with the frontend `api-client.ts`:

```typescript
{
  "success": boolean,
  "data": T,
  "error": string (optional),
  "code": string | number (optional)
}

```

### Main Endpoint Groups

- `/auth`: Authentication endpoints.
- `/overview`: Aggregated data (Net worth, Cash flow, Charts).
- `/wallets`: CRUD for Accounts and balance retrieval.
- `/transactions`: History, filtering, and record creation.
- `/investments`: Portfolio management and ROI calculations.
- `/goals`: Savings progress tracking.

## 5. Implementation Rules for Cursor

- **Modular Design:** Every feature must have its own module (e.g., `src/modules/transactions/`).
- **Thin Controllers:** Logic must reside in Services. Controllers only handle routing and DTO validation.
- **Transactional Integrity:** Use Prisma `$transaction` when creating transactions to ensure account balances are updated atomically.
- **Precision:** Use high-precision types (Decimal) for all currency calculations.
- **Short & Concise:** Keep implementations focused and avoid unnecessary boilerplate.

## 6. Project Structure

| Path           | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `src/modules/` | Feature-based modules (Overview, Wallets, etc.). |
| `src/common/`  | Global filters, interceptors, and decorators.    |
| `prisma/`      | Schema definition and database migrations.       |
| `test/`        | Unit and E2E testing suites.                     |
