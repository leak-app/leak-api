---
title: Strict English Codebase Language Standards
impact: MEDIUM-HIGH
impactDescription: Enforces consistent English naming across all backend classes, methods, endpoints, database entities, logs, and comments.
tags: conventions, language, naming, english, backend
---

# Strict English Codebase Language Standards

Unlike the front-end (which renders user-facing text in Vietnamese), the entire back-end service operates under a **100% English requirement**.

---

## 1. Scope of English Requirement

Every back-end artifact and identifier MUST be written in English without exception:
- **Code Identifiers**: Class names, method/function names, variables, parameters, and constants.
- **DTOs & Interfaces**: Property names, validation messages, and type signatures.
- **Prisma Schema**: Model names, column names, relation names, and enum values.
- **API Endpoints**: REST paths, route segments, and query parameter keys (e.g., `/v1/transactions?startDate=...`).
- **Logs & Errors**: `Logger.log()`, `Logger.error()`, and `HttpException` messages.
- **Comments & Documentation**: Inline comments, JSDoc blocks, and commit messages.

---

## Code Comparison

### ❌ Incorrect (Vietnamese identifiers, log messages, or route segments)
```typescript
// FORBIDDEN: Vietnamese endpoint path and identifiers
@Controller('giao-dich')
export class GiaoDichController {
  // FORBIDDEN: Vietnamese log string and error message
  private readonly logger = new Logger('GiaoDich');

  @Get('tong-quan')
  async layTongQuan() {
    this.logger.log('Dang lay tong quan chi tieu');
    throw new BadRequestException('Khong tim thay du lieu');
  }
}
```

### ✅ Correct (Clean English across all backend layers)
```typescript
@Controller({ path: 'transactions', version: '1' })
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('overview')
  async getOverview(@CurrentUser('id') userId: string) {
    this.logger.log(`Fetching transaction overview for user: ${userId}`);
    return this.transactionsService.getOverview(userId);
  }
}
```
