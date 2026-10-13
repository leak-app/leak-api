/** The user revoked access, or Google no longer accepts the stored token or scope. */
export class ReconnectRequiredError extends Error {
  constructor(
    message = 'Google access was revoked',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ReconnectRequiredError';
  }
}

/** The spreadsheet no longer exists (the user deleted it, or it is not visible to this token). */
export class SpreadsheetNotFoundError extends Error {
  constructor(
    message = 'Spreadsheet not found',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SpreadsheetNotFoundError';
  }
}

/** Rate limit, 5xx or network failure: worth retrying. */
export class GoogleTransientError extends Error {
  constructor(
    message = 'Google is temporarily unavailable',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GoogleTransientError';
  }
}

/** Any other Google API failure: not retried. */
export class GoogleApiError extends Error {
  constructor(
    message = 'Google API request failed',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GoogleApiError';
  }
}

interface GoogleErrorShape {
  code?: string | number;
  status?: number;
  message?: string;
  response?: { status?: number; data?: { error?: unknown } };
}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

/** The error body is a string for OAuth errors and an object (with details) for API errors. */
function describeApiError(apiError: unknown): string {
  if (typeof apiError === 'string') return apiError;
  if (apiError === undefined || apiError === null) return '';
  try {
    return JSON.stringify(apiError);
  } catch {
    return '';
  }
}

/** Maps whatever googleapis throws to one of the typed errors above. */
export function classifyGoogleError(error: unknown): Error {
  if (
    error instanceof ReconnectRequiredError ||
    error instanceof SpreadsheetNotFoundError ||
    error instanceof GoogleTransientError ||
    error instanceof GoogleApiError
  ) {
    return error;
  }

  const shape = (
    typeof error === 'object' && error !== null ? error : {}
  ) as GoogleErrorShape;
  const numericCode =
    typeof shape.code === 'number' ? shape.code : Number(shape.code);
  const status = shape.response?.status ?? shape.status ?? numericCode;
  const apiError = shape.response?.data?.error;
  const text = `${describeApiError(apiError)} ${shape.message ?? ''}`;
  const options = { cause: error };

  if (/invalid_grant/i.test(text) || status === 401) {
    return new ReconnectRequiredError(undefined, options);
  }
  if (status === 403) {
    if (/rate ?limit|quota/i.test(text)) {
      return new GoogleTransientError(undefined, options);
    }
    // The project (API disabled, billing) is at fault, not the user's grant: asking every user
    // to re-consent would not help, so do not flag connections or fork spreadsheets over it.
    if (/service_disabled|has not been used|is disabled|billing/i.test(text)) {
      return new GoogleApiError(shape.message, options);
    }
    return new ReconnectRequiredError(undefined, options);
  }
  if (status === 404) return new SpreadsheetNotFoundError(undefined, options);
  if (
    status === 429 ||
    (typeof status === 'number' && status >= 500) ||
    (typeof shape.code === 'string' && TRANSIENT_NETWORK_CODES.has(shape.code))
  ) {
    return new GoogleTransientError(undefined, options);
  }

  const message =
    error instanceof Error ? error.message : 'Google API request failed';
  return new GoogleApiError(message, options);
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying only transient failures. Always throws a classified error. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, sleep = defaultSleep } = options;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const classified = classifyGoogleError(error);
      if (!(classified instanceof GoogleTransientError) || attempt >= retries) {
        throw classified;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
