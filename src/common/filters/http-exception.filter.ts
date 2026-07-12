import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ErrorResponse, ErrorPayload } from '../interfaces';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this._normalize(exception);
    const path = request.url;

    this.logger.warn(
      `${request.method} ${path} ${statusCode} - ${message as string}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ErrorResponse = {
      success: false,
      data: null,
      error: { statusCode, message, error },
    };

    response.status(statusCode).json(body);
  }

  private _normalize(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as { message: unknown }).message)
            ? (res as { message: string[] }).message
            : String((res as { message: string }).message)
          : exception.message;
      const error = HttpStatus[status] ?? 'Error';
      return { statusCode: status, message, error };
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'Internal Server Error',
    };
  }
}
