/**
 * Application-level errors with HTTP status codes.
 * Throw these from business logic; response.ts will format them for the client.
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ALREADY_ONBOARDING_COMPLETED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  override readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: ErrorCode;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message);

    this.name = this.constructor.name;

    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
    this.cause = options.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    Object.freeze(this);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, {
      statusCode: 400,
      code: "BAD_REQUEST",
      details,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, {
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, {
      statusCode: 403,
      code: "FORBIDDEN",
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, {
      statusCode: 404,
      code: "NOT_FOUND",
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, {
      statusCode: 409,
      code: "CONFLICT",
      details,
    });
  }
}

export class AlreadyOnboardingCompletedError extends AppError {
  constructor(
    message = "This invitation onboarding has already been completed.",
  ) {
    super(message, {
      statusCode: 409,
      code: "ALREADY_ONBOARDING_COMPLETED",
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, {
      statusCode: 429,
      code: "RATE_LIMITED",
    });
  }
}

/**
 * Returns true if the error is one of our typed AppErrors.
 */
export function isAppError(
  error: unknown,
): error is AppError {
  return error instanceof AppError;
}

/**
 * Converts unknown thrown values into a safe AppError.
 */
export function toAppError(
  error: unknown,
): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      error.message,
      {
        statusCode: 500,
        code: "INTERNAL_ERROR",
        cause: error,
      },
    );
  }

  return new AppError(
    "An unexpected error occurred",
    {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      details: error,
    },
  );
}