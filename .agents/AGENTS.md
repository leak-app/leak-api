# Back-End AI Agent Guidelines — Leak App (NestJS + Prisma + PostgreSQL)

You are an expert Senior Back-End Engineer working on the `api/` workspace of Leak App (NestJS, TypeScript, Prisma ORM, PostgreSQL 16+, @nestjs/schedule). You must strictly follow these rules on **EVERY** task without exception.

Detailed rule documents are located under `.agents/rules/`:
- [`architecture-domain-modules.md`](./rules/architecture-domain-modules.md): Modular domain boundaries, thin controllers, and `@CurrentUser()` context extraction.
- [`database-prisma-conventions.md`](./rules/database-prisma-conventions.md): `@map` / `@@map` snake_case mapping, `@db.Decimal(12, 2)` financial precision, Service boundary, and soft deletes.
- [`api-standardized-response-envelope.md`](./rules/api-standardized-response-envelope.md): Unified `ApiResponse<T>` envelope mapped via `ResponseInterceptor`.
- [`background-sync-google-sheets.md`](./rules/background-sync-google-sheets.md): Daily cron `@Cron('0 0 * * *')`, fault isolation, non-blocking resilience, and idempotent snapshots.
- [`codebase-language-standards.md`](./rules/codebase-language-standards.md): 100% English requirement for all backend code, database schemas, endpoints, logs, and comments.
- [`security-validate-all-input.md`](./rules/security-validate-all-input.md): DTO validation with `class-validator` and global `ValidationPipe`.
- [`security-use-guards.md`](./rules/security-use-guards.md): `JwtAuthGuard` by default, `@Public()` for public routes.
- [`security-auth-jwt.md`](./rules/security-auth-jwt.md): Secure JWT authentication and token lifecycle.
- [`api-use-dto-serialization.md`](./rules/api-use-dto-serialization.md): Serialization and DTOs with `@Exclude()` and `@Expose()`.
- [`api-use-interceptors.md`](./rules/api-use-interceptors.md): Cross-cutting concerns, timing, and response mapping.
- [`api-versioning.md`](./rules/api-versioning.md): URI-based REST endpoint versioning.
- [`security-rate-limiting.md`](./rules/security-rate-limiting.md): Rate limiting with `ThrottlerGuard`.
- [`security-sanitize-output.md`](./rules/security-sanitize-output.md): Sanitizing sensitive data before output.
- [`api-use-pipes.md`](./rules/api-use-pipes.md): Data transformation and validation with NestJS pipes.

---

## 🏛️ 1. Architecture & Modular Boundaries
Keep code strictly organized under domain feature modules (`src/modules/wallets`, `categories`, `transactions`, `budgets`, `goals`, `overview`, `sync`). Controllers must remain thin, delegating all business logic and calculations to domain Services.

## 🗄️ 2. Prisma ORM & Database Rules
PostgreSQL 16+ via Prisma is the sole database and single source of truth. Controllers MUST NEVER call `PrismaService` directly. Financial amounts must use `@db.Decimal(12, 2)`. Use `snake_case` database mapping (`@map`, `@@map`). Use soft deletes (`isDeleted: Boolean`) and deletion restrictions (`onDelete: Restrict`) for historical transaction safety.

## 📥 3. Standardized Response Envelope & DTOs
All responses are formatted into `{ statusCode, message, data, meta }` via `ResponseInterceptor`. All request bodies and query params must be validated with `class-validator` decorators.

## ⏰ 4. Non-Blocking Background Sync
Google Sheets is never a primary database. The daily sync is a one-way cron job running at midnight (`@Cron('0 0 * * *')`). All external calls are wrapped in `try/catch` with logging and must never crash request threads. Snapshots are idempotent by date.

## 🌐 5. 100% English Codebase
All backend code, types, entities, variables, endpoints, logs, and comments must be strictly in English.
