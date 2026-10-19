# CLAUDE.md — Leak API (Backend)

NestJS 11 backend service with TypeScript, Prisma ORM, and PostgreSQL 16+.

---

## ⚡ CLI Commands

Run all commands inside the `api/` directory:

```bash
yarn dev                  # Start NestJS dev server with auto-reload
yarn build                # Compile TypeScript to dist/
yarn lint                 # Run ESLint with auto-fix
yarn format               # Format code with Prettier
yarn test                 # Run Jest unit tests
yarn test:watch           # Run Jest in watch mode
yarn test:cov             # Run unit tests with coverage report
yarn test:e2e             # Run end-to-end tests
yarn prisma:generate      # Generate Prisma Client
yarn prisma:migrate:dev   # Create and apply migrations in development
yarn prisma:migrate:deploy# Deploy migrations in production / staging
npx prisma studio         # Launch Prisma Studio GUI
```

---

## 🏛️ Architecture & Directory Structure

```
src/
├── main.ts               # Bootstrap: /api prefix, cookie parser, CORS, Swagger (non-production)
├── app.module.ts         # Module wiring + global JwtAuthGuard, ResponseInterceptor, HttpExceptionFilter
├── auth/                 # JWT strategy, sessions, password reset, @GetUser(), JwtAuthGuard
├── user/                 # User repository + service
├── common/               # Global PrismaService, decorators (@Public), filters, interceptors,
│                         #   interfaces (response envelope), pipes (ZodValidationPipe), zod helpers
├── utils/                # Cookie helper
├── generated/prisma/     # Generated Prisma client (never edit)
└── modules/              # Domain feature modules
    ├── wallets/          # Liquid + investment accounts, balances
    ├── categories/       # Income, expense & investment categories
    ├── transactions/     # Transaction CRUD + LedgerService (only writer of Account.currentBalance)
    ├── transfers/        # Wallet-to-wallet moves
    ├── valuations/       # Investment balance updates & portfolio summary
    ├── budgets/          # Budget limits & tracking
    ├── goals/            # Savings goals + deposit/withdraw ledger
    ├── outcomes/         # Reflection queue & leak-rate calculator
    ├── reclaim/          # Plug-the-leak offers → savings goals
    ├── overview/         # Dashboard analytics & leak reporting
    ├── quick-log/        # Text → transaction draft (parser + optional Gemini fallback)
    ├── sync/             # Google Sheets non-blocking background export
    └── mail/             # SMTP mailer + Handlebars templates
```

---

## 🔒 Core Backend Rules

### 1. Domain Feature Boundaries & Thin Controllers

- Every domain has its own module under `src/modules/<feature>` (`.module.ts`, `.controller.ts`, `.service.ts`, `dto/<feature>.dto.ts`).
- **Controllers must remain thin**: Extract request context (`@GetUser()`, params, query, body) and delegate all business logic, calculations, and data fetching to domain Services.
- Sibling domain communication should happen via service injection across modules, not by direct database queries across boundaries.

### 2. Prisma ORM & Database Rules

- **PostgreSQL 16+ via Prisma** is the single source of truth.
- **Controllers must NEVER import or call `PrismaService` directly**.
- **Financial Precision**: Every monetary value MUST be defined as `@db.Decimal(12, 2)`. Never use Float or Number in the database schema.
- **Database Mapping**: Use `@map("snake_case_column")` and `@@map("snake_case_table")` to map Prisma models to clean PostgreSQL naming.
- **Data Protection**:
  - Implement soft deletes (`isDeleted: Boolean @default(false)`).
  - Use `onDelete: Restrict` on critical relations (transactions, wallets) to prevent accidental cascade deletion.

### 3. Standardized Response Envelope & DTOs

- Successful responses are wrapped by `ResponseInterceptor` (`src/common/interfaces/response.interface.ts`):
  ```json
  { "success": true, "data": { ... }, "meta": { ... } }
  ```
- Errors are shaped by `HttpExceptionFilter`:
  ```json
  {
    "success": false,
    "data": null,
    "error": { "statusCode": 400, "message": "…", "error": "Bad Request" }
  }
  ```
- **DTO Validation**: Every request body and query has a **zod** schema plus a DTO class that `implements z.infer<typeof schema>`, validated with `ZodValidationPipe` (`@UsePipes(new ZodValidationPipe(schema))`, or `new ZodValidationPipe(schema, 'query')` for queries). Validation messages are Vietnamese.
- zod strips unknown keys by default. Use `.strict()` where silently dropping a field would hide a client bug (e.g. wallet DTOs).

### 4. Authentication & Security

- `JwtAuthGuard` is enabled globally by default. Mark unauthenticated endpoints with the `@Public()` decorator.
- Use the `@GetUser()` custom decorator (`src/auth/get-user.decorator.ts`) to retrieve the authenticated user.
- Never expose sensitive fields (passwords, salts, tokens, external secrets) in responses or log outputs. Select or omit them explicitly in the query or service before returning.

### 5. Background Sync (Google Sheets)

- Scheduled via NestJS Schedule (`@Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` in `sync.scheduler.ts`).
- Google Sheets is an export mirror, never a primary database.
- External API calls must always be wrapped in isolated `try/catch` with structured logging. Sync failures must **never** crash request threads.
- Daily snapshots must be idempotent by date.

### 6. Codebase Language Standard

- **100% English**: All code, database schemas, API routes, DTOs, variable names, logs, and comments must be in English.
