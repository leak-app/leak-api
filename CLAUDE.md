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
├── common/               # Global guards, interceptors, pipes, decorators, filters
│   ├── decorators/       # @CurrentUser(), @Public(), etc.
│   ├── interceptors/     # ResponseInterceptor, LoggingInterceptor
│   └── pipes/            # ValidationPipe configuration
├── config/               # App configuration & environment validation
├── database/             # PrismaModule, PrismaService
└── modules/              # Domain feature modules
    ├── auth/             # Authentication & JWT lifecycle
    ├── wallets/          # Wallet management & balances
    ├── categories/       # Income & expense categorization
    ├── transactions/     # Transaction ingestion & categorization
    ├── budgets/          # Budget limits & tracking
    ├── goals/            # Savings & leak reduction goals
    ├── overview/         # Dashboard analytics & leak reporting
    └── sync/             # Google Sheets non-blocking background sync
```

---

## 🔒 Core Backend Rules

### 1. Domain Feature Boundaries & Thin Controllers
- Every domain has its own module under `src/modules/<feature>` (`.module.ts`, `.controller.ts`, `.service.ts`, `.dto.ts`).
- **Controllers must remain thin**: Extract request context (`@CurrentUser()`, params, query, body) and delegate all business logic, calculations, and data fetching to domain Services.
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
- All responses are wrapped in a unified structure via `ResponseInterceptor`:
  ```json
  {
    "statusCode": 200,
    "message": "Success",
    "data": { ... },
    "meta": { ... }
  }
  ```
- **DTO Validation**: Every request payload (body, query, param) must have an explicit DTO class with `class-validator` and `class-transformer` decorators.
- Strip unknown properties globally with `whitelist: true, forbidNonWhitelisted: true`.

### 4. Authentication & Security
- `JwtAuthGuard` is enabled globally by default. Mark unauthenticated endpoints with the `@Public()` decorator.
- Use the `@CurrentUser()` custom decorator to retrieve the authenticated user payload.
- Never expose sensitive fields (passwords, salts, tokens, external secrets) in response DTOs or log outputs. Use `@Exclude()` from `class-transformer`.

### 5. Background Sync (Google Sheets)
- Scheduled via NestJS Schedule (`@Cron('0 0 * * *')`).
- Google Sheets is an export mirror, never a primary database.
- External API calls must always be wrapped in isolated `try/catch` with structured logging. Sync failures must **never** crash request threads.
- Daily snapshots must be idempotent by date.

### 6. Codebase Language Standard
- **100% English**: All code, database schemas, API routes, DTOs, variable names, logs, and comments must be in English.
