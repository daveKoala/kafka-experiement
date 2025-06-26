import { Request, Response, NextFunction } from "express";
import { logger, logError } from "../config/logger";

// Custom application error class
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    originalError?: Error,
    context?: Record<string, any>,
    isOperational: boolean = true
  ) {
    super(message);

    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.context = context || {};

    // If there's an original error, preserve its stack trace
    if (originalError) {
      // @ts-expect-error
      this.stack = originalError.stack;
      this.cause = originalError;
    }

    // Ensure the message is properly set
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // Helper method to create error response object
  public toJSON(): Record<string, any> {
    return {
      error: {
        message: this.message,
        status: this.statusCode,
        timestamp: this.timestamp,
        requestId: this.requestId || undefined,
        ...(process.env.NODE_ENV === "development" && {
          stack: this.stack,
          context: this.context,
        }),
      },
    };
  }
}

// Predefined error types for common scenarios
export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: any) {
    super(message, 400, undefined, { field, value });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    super(
      `${resource} not found${identifier ? ` with id: ${identifier}` : ""}`,
      404
    );
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, conflictingResource?: string) {
    super(message, 409, undefined, { conflictingResource });
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized access") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden access") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super("Too many requests, please try again later", 429, undefined, {
      retryAfter,
    });
    this.name = "RateLimitError";
  }
}

export class KafkaError extends AppError {
  constructor(message: string, operation: string, originalError?: Error) {
    super(`Kafka ${operation} failed: ${message}`, 503, originalError, {
      operation,
    });
    this.name = "KafkaError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, query?: string, originalError?: Error) {
    super(`Database operation failed: ${message}`, 503, originalError, {
      query,
    });
    this.name = "DatabaseError";
  }
}

// HTTP status code mappings
const getStatusFromError = (error: Error): number => {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  // Map common Node.js errors to HTTP status codes
  switch (error.name) {
    case "ValidationError":
      return 400;
    case "CastError":
      return 400;
    case "SyntaxError":
      return 400;
    case "TypeError":
      return 400;
    case "ReferenceError":
      return 500;
    case "MongoError":
    case "MongooseError":
      return 503;
    case "TimeoutError":
      return 408;
    default:
      return 500;
  }
};

// Determine if error should be exposed to client
const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }

  // Only expose certain types of errors to clients
  const exposedErrors = ["ValidationError", "CastError", "SyntaxError"];

  return exposedErrors.includes(error.name);
};

// Format error for client response
const formatErrorForClient = (
  error: Error,
  requestId?: string
): Record<string, any> => {
  const statusCode = getStatusFromError(error);
  const isOperational = isOperationalError(error);

  // Base error response
  const errorResponse = {
    error: {
      message: isOperational ? error.message : "Internal server error",
      status: statusCode,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  // Add additional details in development
  if (process.env.NODE_ENV === "development") {
    errorResponse.error = {
      ...errorResponse.error,
      // @ts-expect-error
      name: error.name,
      stack: error.stack,
      ...(error instanceof AppError &&
        error.context && { context: error.context }),
    };
  }

  // Add retry information for certain errors
  if (error instanceof RateLimitError && error.context?.retryAfter) {
    errorResponse.error = {
      ...errorResponse.error,
      // @ts-expect-error
      retryAfter: error.context.retryAfter,
    };
  }

  return errorResponse;
};

// Main error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response
  //   next: NextFunction
): void => {
  const requestId = (req as any).requestId || "unknown";
  const statusCode = getStatusFromError(error);

  // Log the error with context
  const errorContext = {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
    body: req.method !== "GET" ? req.body : undefined,
    query: req.query,
    params: req.params,
    headers: {
      "content-type": req.get("Content-Type"),
      authorization: req.get("Authorization") ? "[REDACTED]" : undefined,
    },
  };

  // Use appropriate log level based on error severity
  if (statusCode >= 500) {
    logError(error, errorContext, logger);
  } else if (statusCode >= 400) {
    logger.warn("Client error occurred", {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...errorContext,
    });
  }

  // Don't expose sensitive information in production
  const clientError = formatErrorForClient(error, requestId);

  // Set appropriate headers
  res.status(statusCode);

  // Add retry-after header for rate limiting
  if (error instanceof RateLimitError && error.context?.retryAfter) {
    res.set("Retry-After", error.context.retryAfter.toString());
  }

  // Add CORS headers if needed
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Send error response
  res.json(clientError);
};

// Async error wrapper utility
export const asyncHandler = <T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) => {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation helper
export const validateRequired = (
  fields: Record<string, any>,
  requiredFields: string[]
): void => {
  const missingFields = requiredFields.filter(
    (field) =>
      fields[field] === undefined ||
      fields[field] === null ||
      fields[field] === ""
  );

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missingFields.join(", ")}`,
      missingFields[0],
      undefined
    );
  }
};

// Type validation helpers
export const validateType = (
  value: any,
  expectedType: string,
  fieldName: string
): void => {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new ValidationError(
      `Field '${fieldName}' must be of type ${expectedType}, got ${actualType}`,
      fieldName,
      value
    );
  }
};

export const validateEnum = <T>(
  value: T,
  allowedValues: T[],
  fieldName: string
): void => {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `Field '${fieldName}' must be one of: ${allowedValues.join(", ")}`,
      fieldName,
      value
    );
  }
};

export const validateRange = (
  value: number,
  min: number,
  max: number,
  fieldName: string
): void => {
  if (value < min || value > max) {
    throw new ValidationError(
      `Field '${fieldName}' must be between ${min} and ${max}`,
      fieldName,
      value
    );
  }
};

export const validateLength = (
  value: string,
  minLength: number,
  maxLength: number,
  fieldName: string
): void => {
  if (value.length < minLength || value.length > maxLength) {
    throw new ValidationError(
      `Field '${fieldName}' must be between ${minLength} and ${maxLength} characters`,
      fieldName,
      value
    );
  }
};

// Error factory functions
export const createError = {
  validation: (message: string, field?: string, value?: any) =>
    new ValidationError(message, field, value),

  notFound: (resource: string, identifier?: string | number) =>
    new NotFoundError(resource, identifier),

  conflict: (message: string, resource?: string) =>
    new ConflictError(message, resource),

  unauthorized: (message?: string) => new UnauthorizedError(message),

  forbidden: (message?: string) => new ForbiddenError(message),

  rateLimit: (retryAfter?: number) => new RateLimitError(retryAfter),

  kafka: (message: string, operation: string, originalError?: Error) =>
    new KafkaError(message, operation, originalError),

  database: (message: string, query?: string, originalError?: Error) =>
    new DatabaseError(message, query, originalError),
};

// Unhandled error handlers for process-level errors
export const setupGlobalErrorHandlers = (): void => {
  // Unhandled promise rejections
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    logger.error("Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    // In production, you might want to exit the process
    if (process.env.NODE_ENV === "production") {
      logger.error("Shutting down due to unhandled promise rejection");
      process.exit(1);
    }
  });

  // Uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception", {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Always exit on uncaught exceptions
    logger.error("Shutting down due to uncaught exception");
    process.exit(1);
  });

  // Graceful shutdown signals
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down gracefully");
    process.exit(0);
  });
};

// Health check for error handling system
export const checkErrorHandlerHealth = (): {
  status: "healthy" | "degraded";
  details: Record<string, any>;
} => {
  try {
    // Test error creation
    const testError = new AppError("Test error", 500);
    const errorJson = testError.toJSON();

    return {
      status: "healthy",
      details: {
        errorClassWorking: testError instanceof AppError,
        jsonSerializationWorking: !!errorJson.error,
        environment: process.env.NODE_ENV || "development",
      },
    };
  } catch (error) {
    return {
      status: "degraded",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
};
