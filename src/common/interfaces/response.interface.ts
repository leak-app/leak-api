export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
  timestamp?: string;
}

export interface ErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
}

export interface ErrorResponse {
  success: false;
  data: null;
  error: ErrorPayload;
}
