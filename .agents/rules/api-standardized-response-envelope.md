---
title: Standardized API Response Envelope
impact: HIGH
impactDescription: Enforces a uniform JSON envelope across all endpoints for predictable client consumption.
tags: api, response, interceptor, envelope, pagination
---

# Standardized API Response Envelope

All API endpoints must return data wrapped inside a standardized JSON response envelope mapped automatically by `ResponseInterceptor`.

---

## 1. Uniform Envelope Interface

Every successful response sent to clients must adhere to the `ApiResponse<T>` contract:

```typescript
export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
```

---

## 2. Global Response Mapping via Interceptor

Never manually wrap return values inside `{ statusCode, message, data }` within each controller handler. Return plain domain objects or paginated payloads from controllers, and allow `ResponseInterceptor` to construct the standard envelope:

```typescript
// src/common/interceptors/response.interceptor.ts
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((res) => {
        // Handle paginated responses containing meta
        if (res && typeof res === 'object' && 'data' in res && 'meta' in res) {
          return {
            statusCode,
            message: res.message || 'Success',
            data: res.data,
            meta: res.meta,
          };
        }

        return {
          statusCode,
          message: res?.message || 'Success',
          data: res,
        };
      }),
    );
  }
}
```

---

## Code Comparison

### ❌ Incorrect (Inconsistent and manual response wrapping in controllers)
```typescript
@Get()
async getTransactions() {
  const list = await this.service.findAll();
  // FORBIDDEN: Manual, ad-hoc JSON structure
  return {
    status: 200,
    items: list,
    count: list.length,
  };
}
```

### ✅ Correct (Clean return value wrapped by ResponseInterceptor)
```typescript
@Get()
async getTransactions(
  @CurrentUser('id') userId: string,
  @Query() query: GetTransactionsQueryDto,
) {
  // Returns raw service result; interceptor wraps in standard ApiResponse envelope
  return this.transactionsService.findPaginated(userId, query);
}
```
