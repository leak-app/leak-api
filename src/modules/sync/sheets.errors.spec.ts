/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import {
  chunkRows,
  classifyGoogleError,
  GoogleApiError,
  GoogleTransientError,
  ReconnectRequiredError,
  SpreadsheetNotFoundError,
  withRetry,
} from './sheets.errors';

function httpError(
  status: number,
  data: unknown = {},
  message = 'request failed',
) {
  return Object.assign(new Error(message), { response: { status, data } });
}

describe('classifyGoogleError', () => {
  it('treats invalid_grant as a revoked connection', () => {
    const error = httpError(400, { error: 'invalid_grant' }, 'invalid_grant');
    expect(classifyGoogleError(error)).toBeInstanceOf(ReconnectRequiredError);
  });

  it.each([401, 403])('treats HTTP %i as a revoked connection', (status) => {
    expect(classifyGoogleError(httpError(status))).toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it('treats a 403 that mentions a rate limit as transient', () => {
    const error = httpError(403, {}, 'User Rate Limit Exceeded');
    expect(classifyGoogleError(error)).toBeInstanceOf(GoogleTransientError);
  });

  it('does not treat a disabled Sheets API (a project problem) as a revoked grant', () => {
    const error = httpError(
      403,
      {},
      'Google Sheets API has not been used in project 123 before or it is disabled.',
    );
    expect(classifyGoogleError(error)).toBeInstanceOf(GoogleApiError);
    expect(classifyGoogleError(error)).not.toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it('reads the structured Google error body, so SERVICE_DISABLED is not a revoked grant either', () => {
    const body = {
      error: {
        code: 403,
        message: 'Permission denied.',
        status: 'PERMISSION_DENIED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'SERVICE_DISABLED',
          },
        ],
      },
    };
    expect(
      classifyGoogleError(httpError(403, body, 'Permission denied.')),
    ).toBeInstanceOf(GoogleApiError);
  });

  it('still treats an insufficient-scope 403 as a revoked grant', () => {
    const error = httpError(
      403,
      {},
      'Request had insufficient authentication scopes.',
    );
    expect(classifyGoogleError(error)).toBeInstanceOf(ReconnectRequiredError);
  });

  it('treats 404 as a missing spreadsheet', () => {
    expect(classifyGoogleError(httpError(404))).toBeInstanceOf(
      SpreadsheetNotFoundError,
    );
  });

  it('reads the status from a numeric-string code, as gaxios sets it', () => {
    const error = Object.assign(new Error('not found'), { code: '404' });
    expect(classifyGoogleError(error)).toBeInstanceOf(SpreadsheetNotFoundError);
  });

  it.each([429, 500, 502, 503])('treats HTTP %i as transient', (status) => {
    expect(classifyGoogleError(httpError(status))).toBeInstanceOf(
      GoogleTransientError,
    );
  });

  it('treats network resets as transient', () => {
    const error = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
    });
    expect(classifyGoogleError(error)).toBeInstanceOf(GoogleTransientError);
  });

  it('wraps everything else as a plain API error', () => {
    expect(classifyGoogleError(httpError(400))).toBeInstanceOf(GoogleApiError);
    expect(classifyGoogleError('weird')).toBeInstanceOf(GoogleApiError);
  });

  it('returns an already classified error unchanged', () => {
    const original = new ReconnectRequiredError('x');
    expect(classifyGoogleError(original)).toBe(original);
  });
});

describe('withRetry', () => {
  it('retries transient failures with exponential backoff, then succeeds', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { sleep, baseDelayMs: 500 })).resolves.toBe(
      'ok',
    );
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([500, 1000]);
  });

  it('gives up after the retry budget and throws a transient error', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fn = jest.fn().mockRejectedValue(httpError(503));

    await expect(withRetry(fn, { sleep, retries: 3 })).rejects.toBeInstanceOf(
      GoogleTransientError,
    );
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not retry a revoked connection', async () => {
    const sleep = jest.fn();
    const fn = jest.fn().mockRejectedValue(httpError(401));

    await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry a missing spreadsheet', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(404));
    await expect(withRetry(fn)).rejects.toBeInstanceOf(
      SpreadsheetNotFoundError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('chunkRows', () => {
  it('splits rows into chunks of at most the given size', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no chunks for no rows', () => {
    expect(chunkRows([], 5000)).toEqual([]);
  });
});
