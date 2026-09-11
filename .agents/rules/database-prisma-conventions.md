---
title: Prisma ORM and Database Conventions
impact: CRITICAL
impactDescription: Prevents schema drift, financial calculation inaccuracies, and accidental loss of historical financial transaction records.
tags: database, prisma, postgresql, decimal, mapping, soft-delete
---

# Prisma ORM & Database Conventions

PostgreSQL 16+ via Prisma ORM is the sole database and single source of truth for Leak App. Adhere strictly to the database mapping, financial precision, and boundary constraints below.

---

## 1. Database Mapping (`schema.prisma`)

- **PostgreSQL table and column names** MUST use `snake_case` with explicit `@map("...")` on columns and `@@map("...")` on models.
- **TypeScript model properties** MUST use `camelCase`.

```prisma
model Transaction {
  id          String       @id @default(cuid())
  amount      Decimal      @db.Decimal(12, 2)
  categoryId  String       @map("category_id")
  walletId    String       @map("wallet_id")
  leakReason  LeakReason?  @map("leak_reason")
  reviewedAt  DateTime?    @map("reviewed_at")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  category    Category     @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@map("transactions")
}
```

---

## 2. Financial Precision

- Currency amounts and financial values **MUST** be stored as `@db.Decimal(12, 2)` in PostgreSQL to prevent floating-point rounding errors.
- Never use JavaScript native `Number` for storing or calculating balances in the database.
- Convert `Decimal` values using `.toNumber()` or string formatters inside Services/DTOs before returning responses to the client.

---

## 3. Database Access Boundary

- **Controllers MUST NOT call `PrismaService` directly**.
- All database queries, aggregations, transactions, and business logic MUST reside inside dedicated `@Injectable()` domain Services.
- Controllers are strictly responsible for routing, HTTP status codes, and delegating to Services.

---

## 4. Cascade & Deletion Safety

- Use **soft deletes** (`isDeleted: Boolean @default(false)` and `deletedAt: DateTime? @map("deleted_at")`) for entities like `Category` or `Wallet` to protect historical transaction logs.
- Restrict relational category deletion when active transactions depend on it:
  `@relation(fields: [categoryId], references: [id], onDelete: Restrict)`.

---

## Code Comparison

### ❌ Incorrect (Direct Prisma injection in Controller & unmapped columns)
```typescript
// schema.prisma
model Transaction {
  id String @id
  amount Float // FORBIDDEN: Float causes rounding errors for currency
  category_id String // FORBIDDEN: Direct snake_case in TypeScript model
  // Missing @@map("transactions")
}

// transactions.controller.ts
@Controller('transactions')
export class TransactionsController {
  // FORBIDDEN: Direct PrismaService access in Controller
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getTransactions() {
    return this.prisma.transaction.findMany(); // Bypasses service layer
  }
}
```

### ✅ Correct (Decimal, mapping, Service boundary, deletion safety)
```typescript
// schema.prisma
model Category {
  id        String    @id @default(cuid())
  name      String
  isDeleted Boolean   @default(false) @map("is_deleted")
  deletedAt DateTime? @map("deleted_at")

  transactions Transaction[]

  @@map("categories")
}

// transactions.service.ts
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      include: { category: true },
    });

    return transactions.map((t) => ({
      ...t,
      amount: t.amount.toNumber(),
    }));
  }
}

// transactions.controller.ts
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.transactionsService.findAll(userId);
  }
}
```
