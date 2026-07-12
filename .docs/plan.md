# Phase 1 Implementation Plan: Leak API (Manual tracking MVP)

This document details the backend architectural design for Phase 1 of the **Leak** App. Phase 1 focuses on frictionless manual tracking of wallets, investments, categories, transactions, savings goals, and financial reports.

---

## 1. Relational Database Schema (Prisma & PostgreSQL)

The database will manage users, active sessions, accounts (wallets & assets), categories, transactions, and savings goals. All financial values use the PostgreSQL `Decimal` type via Prisma to prevent float representation/calculation errors.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider     = "prisma-client-js"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  password  String    // Hashed password
  name      String?
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  
  sessions     Session[]
  accounts     Account[]
  categories   Category[]
  transactions Transaction[]
  goals        Goal[]

  @@map("users")
}

model Session {
  id        Int      @id @default(autoincrement())
  token     String   @unique
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userAgent String?  @map("user_agent")
  ipAddress String?  @map("ip_address")
  isRevoked Boolean  @default(false) @map("is_revoked")
  createdAt DateTime @default(now()) @map("created_at")
  expiresAt DateTime @map("expires_at")

  @@map("sessions")
}

enum AccountType {
  LIQUID
  INVESTMENT
}

model Account {
  id             String      @id @default(cuid())
  name           String
  type           AccountType
  initialBalance Decimal     @db.Decimal(12, 2)
  currentBalance Decimal     @db.Decimal(12, 2)
  userId         String      @map("user_id")
  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")

  @@map("accounts")
}

enum CategoryType {
  INCOME
  EXPENSE
  INVESTMENT
}

model Category {
  id           String        @id @default(cuid())
  name         String
  type         CategoryType
  userId       String        @map("user_id")
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")
  
  transactions Transaction[]

  @@map("categories")
}

enum TransactionType {
  INCOME
  EXPENSE
}

model Transaction {
  id          String          @id @default(cuid())
  amount      Decimal         @db.Decimal(12, 2)
  type        TransactionType
  description String?         // Nullable from day one to support Phase 2 AI parsing
  categoryId  String          @map("category_id")
  category    Category        @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  userId      String          @map("user_id")
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  @@map("transactions")
}

model Goal {
  id           String   @id @default(cuid())
  name         String
  targetAmount Decimal  @db.Decimal(12, 2)
  savedAmount  Decimal  @db.Decimal(12, 2)
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("goals")
}
```

---

## 2. Onboarding & Category Seeding

When a new user registers (via traditional sign-up or Google OAuth), a standard list of categories is seeded synchronously in the transaction database under their `userId`.

### Default Seeded Categories:
* **Income (`CategoryType.INCOME`):**
  * `Lương`
  * `Làm thêm`
  * `Quà tặng`
  * `Thu nhập khác`
* **Expense (`CategoryType.EXPENSE`):**
  * `Ăn uống`
  * `Di chuyển`
  * `Nhà cửa & Hóa đơn`
  * `Giải trí`
  * `Mua sắm`
  * `Chi tiêu khác`
* **Investment (`CategoryType.INVESTMENT`):**
  * `Cổ phiếu`
  * `Tiền điện tử`
  * `Tiết kiệm`
  * `Vàng & Bất động sản`

---

## 3. Google OAuth 2.0 Integration

A custom sign-in/up route verifies identity using Google ID Tokens (Credential Tokens) from client-side Google Login.

### Flow:
1. Client sends token to `POST /auth/google-sign-in`.
2. Backend validates the token via HTTP GET to `https://oauth2.googleapis.com/tokeninfo?id_token=<credentialToken>`.
3. If Google returns success:
   * Read `email`, `name`, and Google profile unique ID.
   * If a user with `email` does not exist: create the user record, seed default categories, and create a session.
   * If a user with `email` exists: retrieve user record, update provider tokens, and create a session.
   * Issue JWT `accessToken` and HTTP-only cookie `refreshToken`.

---

## 4. REST API Endpoint Specifications

All endpoints follow modular patterns (`src/modules/[feature]`) and return standard JSON envelopes.

### 4.1 Liquid Wallets & Investment Accounts (`/wallets`)
* `GET /wallets` — Retrieve list of accounts.
* `POST /wallets` — Create account.
  * Body: `{ name: string, type: AccountType, initialBalance: number }`
* `PATCH /wallets/:id` — Update account (allows manual balance override).
  * Body: `{ name?: string, currentBalance?: number }`
* `DELETE /wallets/:id` — Delete account.

### 4.2 Categories (`/categories`)
* `GET /categories` — List user categories.
* `POST /categories` — Create custom category.
  * Body: `{ name: string, type: CategoryType }`
* `DELETE /categories/:id` — Delete category.

### 4.3 Transactions (`/transactions`)
* `GET /transactions` — Fetch paginated transactions log.
  * Query parameters: `page`, `limit`, `type`, `categoryId`, `startDate`, `endDate`, `minAmount`, `maxAmount`
* `POST /transactions` — Create a transaction record.
  * Body: `{ amount: number, type: TransactionType, categoryId: string, description?: string }`
* `PATCH /transactions/:id` — Edit transaction record.
  * Body: `{ amount?: number, type?: TransactionType, categoryId?: string, description?: string }`
* `DELETE /transactions/:id` — Delete transaction.

### 4.4 Savings Goals (`/goals`)
* `GET /goals` — Fetch savings goals and target progress.
* `POST /goals` — Create savings goal.
  * Body: `{ name: string, targetAmount: number, savedAmount: number }`
* `PATCH /goals/:id` — Update savings goal target/saved amount.
  * Body: `{ name?: string, targetAmount?: number, savedAmount?: number }`
* `DELETE /goals/:id` — Delete a goal.

### 4.5 Reports & Dashboards (`/overview`)
* `GET /overview/daily` — Aggregate total spend and total income for previous day (compared to today).
* `GET /overview/weekly` — Aggregate total spend and total income for previous week.
* `GET /overview/monthly` — Aggregate total spend and total income for previous month.
