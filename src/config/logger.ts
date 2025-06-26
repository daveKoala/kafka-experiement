import winston, { Logger, LoggerOptions } from "winston";
import * as path from "path";
import * as fs from "fs";

// Custom log levels with priorities
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "cyan",
    debug: "blue",
  },
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || "./logs";

// Ensure log directory exists
function ensureLogDirectory(): void {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      fs.mkdirSync(LOG_FILE_PATH, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create log directory:", error);
  }
}

ensureLogDirectory();

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ["message", "level", "timestamp", "label"],
  }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: "HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, label, ...meta }) => {
    const labelStr = label ? `[${label}] ` : "";
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} ${level}: ${labelStr}${message}${metaStr}`;
  })
);

// Production format (optimized for log aggregation)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ["message", "level", "timestamp"],
  }),
  winston.format.json(),
  winston.format.printf((info) => {
    // Add service metadata for log aggregation
    const logEntry: Record<string, any> = {
      "@timestamp": info.timestamp,
      level: info.level,
      message: info.message,
      service: "kafka-pipeline",
      environment: NODE_ENV,
      version: process.env.npm_package_version || "1.0.0",
      hostname: require("os").hostname(),
      pid: process.pid,
      ...(info.metadata || {}),
    };

    // Add stack trace for errors
    if (info.stack) {
      logEntry.stack = info.stack;
    }

    return JSON.stringify(logEntry);
  })
);

// File rotation configuration
const getFileRotationConfig = (filename: string) => ({
  filename: path.join(LOG_FILE_PATH, filename),
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  auditFile: path.join(LOG_FILE_PATH, `.${filename}-audit.json`),
  zippedArchive: true,
  format: NODE_ENV === "production" ? productionFormat : structuredFormat,
});

// Transport configurations
const transports: winston.transport[] = [];

// Console transport (always enabled for development)
if (NODE_ENV !== "production" || process.env.ENABLE_CONSOLE_LOGS === "true") {
  transports.push(
    new winston.transports.Console({
      level: LOG_LEVEL,
      format: NODE_ENV === "production" ? productionFormat : consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// File transports
if (NODE_ENV === "production" || process.env.ENABLE_FILE_LOGS === "true") {
  // Use daily rotate file for production
  const DailyRotateFile = require("winston-daily-rotate-file");

  // Combined log file (all levels)
  transports.push(
    new DailyRotateFile({
      ...getFileRotationConfig("combined-%DATE%.log"),
      level: LOG_LEVEL,
    })
  );

  // Error log file (errors only)
  transports.push(
    new DailyRotateFile({
      ...getFileRotationConfig("error-%DATE%.log"),
      level: "error",
    })
  );

  // HTTP log file (for API requests)
  transports.push(
    new DailyRotateFile({
      ...getFileRotationConfig("http-%DATE%.log"),
      level: "http",
    })
  );
} else {
  // Simple file transports for development
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_FILE_PATH, "error.log"),
      level: "error",
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_FILE_PATH, "combined.log"),
      level: LOG_LEVEL,
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Logger configuration
const loggerConfig: LoggerOptions = {
  level: LOG_LEVEL,
  levels: customLevels.levels,
  format: structuredFormat,
  defaultMeta: {
    service: "kafka-pipeline",
    environment: NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  },
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
};

// Create logger instance
export const logger: Logger = winston.createLogger(loggerConfig);

// Create child logger with label
export function createChildLogger(label: string): Logger {
  return logger.child({ label });
}

// Performance logging utilities
export class PerformanceLogger {
  private static timers: Map<string, number> = new Map();

  public static startTimer(id: string): void {
    this.timers.set(id, Date.now());
  }

  public static endTimer(id: string, message?: string): number {
    const startTime = this.timers.get(id);
    if (!startTime) {
      logger.warn("Timer not found for endTimer call", { timerId: id });
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(id);

    logger.info(message || `Timer ${id} completed`, {
      timerId: id,
      duration,
      unit: "ms",
    });

    return duration;
  }

  public static logDuration<T>(
    id: string,
    fn: () => Promise<T>,
    message?: string
  ): Promise<T> {
    this.startTimer(id);
    return fn().finally(() => {
      this.endTimer(id, message);
    });
  }
}

// Request ID middleware helper
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Structured logging helpers
export const loggers = {
  // API request logging
  api: createChildLogger("API"),

  // Kafka operations
  kafka: createChildLogger("KAFKA"),

  // Producer operations
  producer: createChildLogger("PRODUCER"),

  // Consumer operations
  consumer: createChildLogger("CONSUMER"),

  // Database operations
  database: createChildLogger("DATABASE"),

  // Authentication
  auth: createChildLogger("AUTH"),

  // Background jobs
  jobs: createChildLogger("JOBS"),

  // System monitoring
  system: createChildLogger("SYSTEM"),
};

// Error logging with context
export function logError(
  error: Error | unknown,
  context: Record<string, any> = {},
  logger_instance: Logger = logger
): void {
  const errorInfo =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : {
          message: "Unknown error",
          error: error,
        };

  logger_instance.error("Error occurred", {
    ...errorInfo,
    ...context,
    timestamp: new Date().toISOString(),
  });
}

// HTTP request logging middleware
export function createHttpLogger() {
  return (req: any, res: any, next: any) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Add request ID to request object
    req.requestId = requestId;

    // Log request start
    loggers.api.http("HTTP Request Started", {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.get("User-Agent"),
      ip: req.ip || req.connection.remoteAddress,
      headers: req.headers,
    });

    // Log response
    const originalSend = res.send;
    res.send = function (data: any) {
      const duration = Date.now() - startTime;

      loggers.api.http("HTTP Request Completed", {
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get("Content-Length") || data?.length || 0,
      });

      return originalSend.call(this, data);
    };

    next();
  };
}

// Log aggregation helpers for monitoring systems
export function createLogAggregator(service: string) {
  return {
    metric: (name: string, value: number, tags: Record<string, any> = {}) => {
      logger.info("Metric", {
        metricName: name,
        metricValue: value,
        metricTags: tags,
        service,
        type: "metric",
      });
    },

    event: (name: string, data: Record<string, any> = {}) => {
      logger.info("Event", {
        eventName: name,
        eventData: data,
        service,
        type: "event",
      });
    },

    trace: (
      operationName: string,
      duration: number,
      tags: Record<string, any> = {}
    ) => {
      logger.info("Trace", {
        operationName,
        duration,
        tags,
        service,
        type: "trace",
      });
    },
  };
}

// Health check for logging system
export function checkLoggerHealth(): {
  status: "healthy" | "degraded" | "unhealthy";
  details: Record<string, any>;
} {
  try {
    // Check if log directory is writable
    const testFile = path.join(LOG_FILE_PATH, ".health-check");
    require("fs").writeFileSync(testFile, "test", "utf8");
    require("fs").unlinkSync(testFile);

    return {
      status: "healthy",
      details: {
        logLevel: LOG_LEVEL,
        logPath: LOG_FILE_PATH,
        transports: transports.length,
        environment: NODE_ENV,
      },
    };
  } catch (error) {
    return {
      status: "unhealthy",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
        logLevel: LOG_LEVEL,
        logPath: LOG_FILE_PATH,
      },
    };
  }
}

// Graceful shutdown for logger
export async function shutdownLogger(): Promise<void> {
  return new Promise((resolve) => {
    logger.on("finish", resolve);
    logger.end();
  });
}

// Export configuration for debugging
export const loggerConfig_info = {
  level: LOG_LEVEL,
  environment: NODE_ENV,
  logPath: LOG_FILE_PATH,
  transportsCount: transports.length,
  fileLogging:
    NODE_ENV === "production" || process.env.ENABLE_FILE_LOGS === "true",
  consoleLogging:
    NODE_ENV !== "production" || process.env.ENABLE_CONSOLE_LOGS === "true",
};

// Log initialization
logger.info("Logger initialized", loggerConfig_info);
