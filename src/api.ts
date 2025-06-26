import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { LogProducer } from "./producer";
import { logger } from "./config/logger";
import { AppError, errorHandler } from "./middleware/errorHandler";

interface LogRequest {
  level?: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, any>;
}

interface MetricRequest {
  name: string;
  value: number;
  tags?: Record<string, any>;
}

interface BulkLogRequest {
  logs: Array<{
    level?: "info" | "warn" | "error" | "debug";
    message: string;
    metadata?: Record<string, any>;
  }>;
}

interface DemoRequest {
  duration?: number;
}

interface HealthResponse {
  status: "healthy" | "unhealthy";
  kafkaConnected: boolean;
  timestamp: string;
  uptime: number;
  version: string;
}

class ApiServer {
  private app: Application;
  private producer: LogProducer;
  private readonly port: number;

  constructor() {
    this.app = express();
    this.producer = new LogProducer();
    this.port = parseInt(process.env.PORT || "3000", 10);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
      message: {
        error: "Too many requests from this IP, please try again later.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use(limiter);
    this.app.use(cors());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info("API Request", {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get(
      "/health",
      async (_req: Request, res: Response<HealthResponse>) => {
        try {
          const health: HealthResponse = {
            status: this.producer.isConnected ? "healthy" : "unhealthy",
            kafkaConnected: this.producer.isConnected,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || "1.0.0",
          };

          res.status(this.producer.isConnected ? 200 : 503).json(health);
        } catch (error) {
          logger.error("Health check failed:", error);
          res.status(503).json({
            status: "unhealthy",
            kafkaConnected: false,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || "1.0.0",
          });
        }
      }
    );

    // Send single log endpoint
    this.app.post(
      "/logs",
      async (req: Request<{}, any, LogRequest>, res: Response) => {
        try {
          const { level = "info", message, metadata = {} } = req.body;

          if (!message || typeof message !== "string") {
            throw new AppError("Message is required and must be a string", 400);
          }

          const logEntry = await this.producer.sendLog(level, message, {
            ...metadata,
            source: "api",
            clientIp: req.ip,
            userAgent: req.get("User-Agent"),
            requestId: this.generateRequestId(),
          });

          res.status(201).json({
            success: true,
            logEntry,
            messageId: logEntry.timestamp,
          });
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError("Failed to send log", 500, error as Error);
        }
      }
    );

    // Send metric endpoint
    this.app.post(
      "/metrics",
      async (req: Request<{}, any, MetricRequest>, res: Response) => {
        try {
          const { name, value, tags = {} } = req.body;

          if (!name || typeof name !== "string") {
            throw new AppError(
              "Metric name is required and must be a string",
              400
            );
          }

          if (value === undefined || typeof value !== "number") {
            throw new AppError(
              "Metric value is required and must be a number",
              400
            );
          }

          const metric = await this.producer.sendMetric(name, value, {
            ...tags,
            source: "api",
            requestId: this.generateRequestId(),
          });

          res.status(201).json({
            success: true,
            metric,
            messageId: metric.timestamp,
          });
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError("Failed to send metric", 500, error as Error);
        }
      }
    );

    // Bulk send logs endpoint
    this.app.post(
      "/logs/bulk",
      async (req: Request<{}, any, BulkLogRequest>, res: Response) => {
        try {
          const { logs } = req.body;

          if (!Array.isArray(logs)) {
            throw new AppError("Logs must be an array", 400);
          }

          if (logs.length > 100) {
            throw new AppError("Maximum 100 logs per bulk request", 400);
          }

          const requestId = this.generateRequestId();
          const results = await Promise.allSettled(
            logs.map(async (log, index) => {
              if (!log.message || typeof log.message !== "string") {
                throw new Error(
                  `Log at index ${index}: message is required and must be a string`
                );
              }

              return await this.producer.sendLog(
                log.level || "info",
                log.message,
                {
                  ...log.metadata,
                  source: "api-bulk",
                  requestId,
                  bulkIndex: index,
                }
              );
            })
          );

          const successCount = results.filter(
            (r) => r.status === "fulfilled"
          ).length;
          const failures = results
            .map((result, index) => ({ index, result }))
            .filter(({ result }) => result.status === "rejected")
            .map(({ index, result }) => ({
              index,
              error:
                result.status === "rejected"
                  ? result.reason.message
                  : "Unknown error",
            }));

          res.status(207).json({
            success: failures.length === 0,
            processed: logs.length,
            successful: successCount,
            failed: failures.length,
            failures: failures.length > 0 ? failures : undefined,
            requestId,
          });
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError(
            "Failed to process bulk logs",
            500,
            error as Error
          );
        }
      }
    );

    // Start demo log generation endpoint
    this.app.post(
      "/start-demo",
      async (req: Request<{}, any, DemoRequest>, res: Response) => {
        try {
          const { duration = 30 } = req.body;

          if (typeof duration !== "number" || duration < 1 || duration > 300) {
            throw new AppError(
              "Duration must be a number between 1 and 300 seconds",
              400
            );
          }

          const maxLogs = duration * 2; // 2 logs per second
          let counter = 0;
          const requestId = this.generateRequestId();

          const interval = setInterval(async () => {
            if (counter >= maxLogs) {
              clearInterval(interval);
              logger.info("Demo completed", { requestId, totalLogs: counter });
              return;
            }

            try {
              await this.producer.generateSampleLogs();
              counter++;
            } catch (error) {
              logger.error("Error in demo log generation:", error);
            }
          }, 500);

          res.status(202).json({
            success: true,
            message: `Demo started - will generate approximately ${maxLogs} logs over ${duration} seconds`,
            duration,
            estimatedLogs: maxLogs,
            requestId,
          });
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError("Failed to start demo", 500, error as Error);
        }
      }
    );

    // API info endpoint
    this.app.get("/", (_req: Request, res: Response) => {
      res.json({
        name: "Kafka Log Pipeline API",
        version: process.env.npm_package_version || "1.0.0",
        description:
          "TypeScript Node.js API for sending logs and metrics to Kafka",
        endpoints: {
          "GET /health": "Health check",
          "POST /logs": "Send a single log message",
          "POST /metrics": "Send a metric",
          "POST /logs/bulk": "Send multiple log messages",
          "POST /start-demo": "Start demo log generation",
        },
        kafka: {
          connected: this.producer.isConnected,
          brokers: process.env.KAFKA_BROKERS || "localhost:9092",
        },
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        error: "Endpoint not found",
        path: req.originalUrl,
        method: req.method,
      });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async start(): Promise<void> {
    try {
      // Connect to Kafka first
      await this.producer.connect();
      logger.info("Kafka producer connected successfully");

      // Start the server
      this.app.listen(this.port, () => {
        logger.info(`🚀 API server running on port ${this.port}`);
        logger.info("📋 Available endpoints:");
        logger.info("  GET  /health");
        logger.info("  POST /logs");
        logger.info("  POST /metrics");
        logger.info("  POST /logs/bulk");
        logger.info("  POST /start-demo");
        logger.info(`🎯 Kafka UI available at http://localhost:8080`);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error("Failed to start API server:", error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        await this.producer.disconnect();
        logger.info("Kafka producer disconnected");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new ApiServer();
  server.start().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}

export { ApiServer };
