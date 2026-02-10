export enum ErrorCode {
  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Domain errors
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  LLM_ERROR = 'LLM_ERROR',
  QDRANT_ERROR = 'QDRANT_ERROR',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
}

export const ErrorStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.TOOL_EXECUTION_FAILED]: 502,
  [ErrorCode.LLM_ERROR]: 502,
  [ErrorCode.QDRANT_ERROR]: 503,
  [ErrorCode.CONVERSATION_NOT_FOUND]: 404,
  [ErrorCode.MCP_CONNECTION_FAILED]: 503,
};

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = ErrorStatusMap[code] || 500;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}
