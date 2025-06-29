import {
  Consumer,
  EachMessagePayload,
  ConsumerRunConfig,
  ConsumerSubscribeTopics,
} from "kafkajs";
import { kafka, TOPICS } from "./config/kafka";
import { logger } from "./config/logger";
import type {
  LogEntry,
  Metric,
  ConsumerStats,
  ProcessingContext,
  AlertConfig,
} from "./types";

export class LogConsumer {
  private consumer: Consumer;
  private _isConnected: boolean = false;
  private stats: Omit<ConsumerStats, "uptime" | "isConnected" | "throughput"> =
    {
      totalMessagesProcessed: 0,
      messagesByTopic: {},
      messagesByLevel: {},
      processingErrors: 0,
      lastMessageProcessed: null,
      lag: {},
    };
  private readonly startTime: number;
  private messageTimestamps: number[] = [];
  private alertConfig: AlertConfig;
  private processingHandlers: Map<
    string,
    (data: any, context: ProcessingContext) => Promise<void>
  >;

  constructor(groupId?: string) {
    const consumerGroupId =
      groupId || process.env.CONSUMER_GROUP_ID || "log-processing-group";

    this.consumer = kafka.consumer({
      groupId: consumerGroupId,
      maxWaitTimeInMs: 3000,
      sessionTimeout: parseInt(
        process.env.CONSUMER_SESSION_TIMEOUT || "30000",
        10
      ),
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      minBytes: 1,
      maxBytes: 10485760, // 10MB
      allowAutoTopicCreation: false,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 1000,
        factor: 2,
      },
    });

    this.startTime = Date.now();
    this.alertConfig = {
      errorThreshold: 10,
      warningThreshold: 50,
      responseTimeThreshold: 1000,
      memoryThreshold: 85,
    };

    this.processingHandlers = new Map();
    this.setupDefaultHandlers();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.consumer.on("consumer.connect", () => {
      logger.info("Kafka consumer connected");
      this._isConnected = true;
    });

    this.consumer.on("consumer.disconnect", () => {
      logger.info("Kafka consumer disconnected");
      this._isConnected = false;
    });

    this.consumer.on("consumer.crash", ({ payload }) => {
      logger.error("Kafka consumer crashed", { error: payload.error });
      this._isConnected = false;
      this.stats.processingErrors++;
    });

    this.consumer.on("consumer.group_join", ({ payload }) => {
      logger.info("Consumer joined group", {
        groupId: payload.groupId,
        memberId: payload.memberId,
        groupProtocol: payload.groupProtocol,
      });
    });

    this.consumer.on("consumer.rebalancing", () => {
      logger.info("Consumer group rebalancing...");
    });
  }

  private setupDefaultHandlers(): void {
    // Register default processing handlers for different log levels
    this.processingHandlers.set("error", this.handleErrorLog.bind(this));
    this.processingHandlers.set("warn", this.handleWarningLog.bind(this));
    this.processingHandlers.set("info", this.handleInfoLog.bind(this));
    this.processingHandlers.set("debug", this.handleDebugLog.bind(this));
    this.processingHandlers.set("metric", this.handleMetric.bind(this));
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      this._isConnected = true;
      logger.info("Kafka consumer connected successfully");
    } catch (error) {
      this._isConnected = false;
      const errorMessage = `Failed to connect Kafka consumer: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this._isConnected = false;
      logger.info("Kafka consumer disconnected successfully");
    } catch (error) {
      const errorMessage = `Failed to disconnect Kafka consumer: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  public async subscribe(fromBeginning: boolean = false): Promise<void> {
    try {
      const subscribeOptions: ConsumerSubscribeTopics = {
        topics: Object.values(TOPICS),
        fromBeginning,
      };

      await this.consumer.subscribe(subscribeOptions);
      logger.info("Successfully subscribed to topics:", {
        topics: Object.values(TOPICS),
        fromBeginning,
      });
    } catch (error) {
      const errorMessage = `Failed to subscribe to topics: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  public async startConsuming(): Promise<void> {
    try {
      const runConfig: ConsumerRunConfig = {
        partitionsConsumedConcurrently: 3,
        eachMessage: this.processMessage.bind(this),
      };

      logger.info("🚀 Starting message consumption...");
      await this.consumer.run(runConfig);
    } catch (error) {
      const errorMessage = `Failed to start consuming: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message, heartbeat } = payload;

    try {
      // Send heartbeat to maintain group membership
      await heartbeat();

      // Extract message details
      const context: ProcessingContext = {
        topic,
        partition,
        offset: message.offset,
        timestamp: new Date().toISOString(),
        headers: this.extractHeaders(message.headers),
      };

      // Update lag tracking
      this.updateLagStats(topic, message);

      // Log message receipt
      logger.debug("Received message", {
        topic,
        partition,
        offset: message.offset,
        key: message.key?.toString(),
        size: message.value?.length || 0,
        headers: context.headers,
      });

      // Route message based on topic
      await this.routeMessage(topic, message, context);

      // Update statistics
      this.updateProcessingStats(topic, context);
    } catch (error) {
      this.stats.processingErrors++;
      logger.error("Error processing message", {
        topic,
        partition,
        offset: message.offset,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Don't rethrow - this would stop the consumer
      // Instead, continue processing other messages
    }
  }

  private async routeMessage(
    topic: string,
    message: any,
    context: ProcessingContext
  ): Promise<void> {
    try {
      const messageValue = message.value?.toString();
      if (!messageValue) {
        logger.warn("Received empty message", {
          topic,
          offset: context.offset,
        });
        return;
      }

      const parsedData = JSON.parse(messageValue);

      switch (topic) {
        case TOPICS.LOGS:
        case TOPICS.ERRORS:
          await this.processLogMessage(parsedData, context);
          break;
        case TOPICS.METRICS:
          await this.processMetricMessage(parsedData, context);
          break;
        default:
          logger.warn("Unknown topic received", {
            topic,
            offset: context.offset,
          });
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error("Invalid JSON in message", {
          topic,
          offset: context.offset,
          error: error.message,
        });
      } else {
        throw error; // Re-throw non-JSON errors
      }
    }
  }

  private async processLogMessage(
    logData: LogEntry,
    context: ProcessingContext
  ): Promise<void> {
    try {
      const level = logData.level || "info";

      // Update level statistics
      this.stats.messagesByLevel[level] =
        (this.stats.messagesByLevel[level] || 0) + 1;

      // Get appropriate handler
      const handler = this.processingHandlers.get(level);
      if (handler) {
        await handler(logData, context);
      } else {
        await this.handleGenericLog(logData, context);
      }

      logger.debug(`Processed ${level} log`, {
        message: logData.message?.substring(0, 100),
        service: logData.service,
        timestamp: logData.timestamp,
        context,
      });
    } catch (error) {
      logger.error("Error processing log message", {
        error: error instanceof Error ? error.message : "Unknown error",
        logData: { ...logData, message: logData.message?.substring(0, 100) },
        context,
      });
      throw error;
    }
  }

  private async processMetricMessage(
    metricData: Metric,
    context: ProcessingContext
  ): Promise<void> {
    try {
      const handler = this.processingHandlers.get("metric");
      if (handler) {
        await handler(metricData, context);
      }

      logger.debug("Processed metric", {
        name: metricData.name,
        value: metricData.value,
        tags: metricData.tags,
        timestamp: metricData.timestamp,
        context,
      });
    } catch (error) {
      logger.error("Error processing metric message", {
        error: error instanceof Error ? error.message : "Unknown error",
        metricData,
        context,
      });
      throw error;
    }
  }

  // Default message handlers
  private async handleErrorLog(
    logData: LogEntry,
    _context: ProcessingContext
  ): Promise<void> {
    // Critical error processing
    logger.error("🚨 CRITICAL ERROR DETECTED", {
      message: logData.message,
      service: logData.service,
      metadata: logData.metadata,
      context: _context,
    });

    // In production, this could:
    // - Send alerts to PagerDuty/Slack
    // - Create incident tickets
    // - Trigger automated remediation
    // - Store in error tracking system (Sentry, Rollbar)

    await this.triggerErrorAlert(logData, _context);
  }

  private async handleWarningLog(
    logData: LogEntry,
    _context: ProcessingContext
  ): Promise<void> {
    logger.warn("⚠️ WARNING DETECTED", {
      message: logData.message,
      service: logData.service,
      metadata: logData.metadata,
    });

    // Track warning patterns
    await this.trackWarningTrends(logData);

    // Escalate if too many warnings from same service
    await this.checkWarningThreshold(logData.service);
  }

  private async handleInfoLog(
    logData: LogEntry,
    _context: ProcessingContext
  ): Promise<void> {
    // Business logic based on message content
    if (
      logData.message.includes("logged in") ||
      logData.message.includes("authentication")
    ) {
      await this.trackUserActivity(logData);
    } else if (
      logData.message.includes("API request") ||
      logData.message.includes("request processed")
    ) {
      await this.trackApiUsage(logData);
    } else if (
      logData.message.includes("payment") ||
      logData.message.includes("transaction")
    ) {
      await this.trackBusinessMetrics(logData);
    }

    logger.info("📄 Info log processed", {
      message: logData.message.substring(0, 100),
      service: logData.service,
    });
  }

  private async handleDebugLog(
    logData: LogEntry,
    _context: ProcessingContext
  ): Promise<void> {
    // Debug logs typically used for troubleshooting
    // Store in debug log aggregation system
    logger.debug("🔍 Debug log processed", {
      message: logData.message.substring(0, 100),
      service: logData.service,
    });
  }

  private async handleGenericLog(
    logData: LogEntry,
    _context: ProcessingContext
  ): Promise<void> {
    logger.info("📝 Generic log processed", {
      level: logData.level,
      message: logData.message.substring(0, 100),
      service: logData.service,
    });
  }

  private async handleMetric(
    metricData: Metric,
    _context: ProcessingContext
  ): Promise<void> {
    // Process different types of metrics
    switch (metricData.name) {
      case "response_time":
      case "response_time_ms":
        if (metricData.value > this.alertConfig.responseTimeThreshold) {
          logger.warn("🐌 Slow response time detected", {
            value: metricData.value,
            threshold: this.alertConfig.responseTimeThreshold,
            tags: metricData.tags,
          });
          await this.alertSlowResponse(metricData);
        }
        break;

      case "memory_usage":
      case "memory_usage_percent":
        if (metricData.value > this.alertConfig.memoryThreshold) {
          logger.warn("💾 High memory usage detected", {
            value: metricData.value,
            threshold: this.alertConfig.memoryThreshold,
            tags: metricData.tags,
          });
          await this.alertHighMemory(metricData);
        }
        break;

      case "error_rate":
      case "error_rate_percent":
        if (metricData.value > 5) {
          logger.warn("📈 High error rate detected", {
            value: metricData.value,
            tags: metricData.tags,
          });
        }
        break;

      default:
        logger.info("📊 Metric processed", {
          name: metricData.name,
          value: metricData.value,
          tags: metricData.tags,
        });
    }

    // Store metric for time-series analysis
    await this.storeMetricForAnalysis(metricData);
  }

  // Alert and tracking methods
  private async triggerErrorAlert(
    logData: LogEntry,
    context: ProcessingContext
  ): Promise<void> {
    // Implementation would depend on alerting system
    // Examples: PagerDuty, Slack, Email, SMS
    logger.error("ALERT: Critical error requires attention", {
      service: logData.service,
      message: logData.message,
      metadata: logData.metadata,
      context,
    });
  }

  private async trackWarningTrends(logData: LogEntry): Promise<void> {
    // Track warning patterns over time
    // Could store in time-series database for trend analysis
    logger.debug("Tracking warning trend", {
      service: logData.service,
      timestamp: logData.timestamp,
    });
  }

  private async checkWarningThreshold(service: string): Promise<void> {
    // Check if service has exceeded warning threshold
    const serviceWarnings = this.stats.messagesByLevel["warn"] || 0;
    if (serviceWarnings > this.alertConfig.warningThreshold) {
      logger.warn("Service exceeded warning threshold", {
        service,
        warningCount: serviceWarnings,
        threshold: this.alertConfig.warningThreshold,
      });
    }
  }

  private async trackUserActivity(logData: LogEntry): Promise<void> {
    logger.info("👤 User activity tracked", {
      userId: logData.metadata?.userId,
      sessionId: logData.metadata?.sessionId,
      activity: "authentication",
    });
  }

  private async trackApiUsage(logData: LogEntry): Promise<void> {
    logger.info("🌐 API usage tracked", {
      endpoint: logData.metadata?.endpoint,
      method: logData.metadata?.method,
      responseTime: logData.metadata?.responseTime,
      statusCode: logData.metadata?.statusCode,
    });
  }

  private async trackBusinessMetrics(logData: LogEntry): Promise<void> {
    logger.info("💰 Business metric tracked", {
      type: "transaction",
      service: logData.service,
      timestamp: logData.timestamp,
    });
  }

  private async alertSlowResponse(metricData: Metric): Promise<void> {
    // Alert on slow response times
    logger.warn("Performance alert triggered", {
      metric: metricData.name,
      value: metricData.value,
      tags: metricData.tags,
    });
  }

  private async alertHighMemory(metricData: Metric): Promise<void> {
    // Alert on high memory usage
    logger.warn("Resource alert triggered", {
      metric: metricData.name,
      value: metricData.value,
      tags: metricData.tags,
    });
  }

  private async storeMetricForAnalysis(metricData: Metric): Promise<void> {
    // Store metrics for time-series analysis
    // Could send to InfluxDB, Prometheus, CloudWatch, etc.
    logger.debug("Metric stored for analysis", {
      name: metricData.name,
      value: metricData.value,
      timestamp: metricData.timestamp,
    });
  }

  // Utility methods
  private extractHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        result[key] = value?.toString() || "";
      }
    }
    return result;
  }

  private updateLagStats(topic: string, message: any): void {
    // Calculate approximate lag (simplified)
    const now = Date.now();
    const messageTimestamp = message.timestamp
      ? parseInt(message.timestamp)
      : now;
    const lag = Math.max(0, now - messageTimestamp);
    this.stats.lag[topic] = lag;
  }

  private updateProcessingStats(
    topic: string,
    context: ProcessingContext
  ): void {
    this.stats.totalMessagesProcessed++;
    this.stats.messagesByTopic[topic] =
      (this.stats.messagesByTopic[topic] || 0) + 1;
    this.stats.lastMessageProcessed = context.timestamp;

    // Track throughput
    this.messageTimestamps.push(Date.now());
    // Keep only last minute of timestamps
    const oneMinuteAgo = Date.now() - 60000;
    this.messageTimestamps = this.messageTimestamps.filter(
      (ts) => ts > oneMinuteAgo
    );
  }

  public getStats(): ConsumerStats {
    const throughput = {
      messagesPerSecond: this.messageTimestamps.length / 60, // Messages per second over last minute
      lastCalculated: new Date().toISOString(),
    };

    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
      isConnected: this._isConnected,
      throughput,
    };
  }

  public resetStats(): void {
    this.stats = {
      totalMessagesProcessed: 0,
      messagesByTopic: {},
      messagesByLevel: {},
      processingErrors: 0,
      lastMessageProcessed: null,
      lag: {},
    };
    this.messageTimestamps = [];
    logger.info("Consumer statistics reset");
  }

  public startStatsReporting(intervalMs: number = 30000): NodeJS.Timeout {
    const interval = setInterval(() => {
      const stats = this.getStats();
      logger.info("📈 Consumer Statistics", {
        totalProcessed: stats.totalMessagesProcessed,
        throughput: `${stats.throughput.messagesPerSecond.toFixed(2)} msg/sec`,
        errors: stats.processingErrors,
        uptime: `${Math.floor(stats.uptime / 1000)}s`,
        topics: stats.messagesByTopic,
        levels: stats.messagesByLevel,
        lag: stats.lag,
      });
    }, intervalMs);

    return interval;
  }

  // Custom handler registration
  public registerHandler(
    level: string,
    handler: (data: any, context: ProcessingContext) => Promise<void>
  ): void {
    this.processingHandlers.set(level, handler);
    logger.info("Custom handler registered", { level });
  }

  public updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    logger.info("Alert configuration updated", this.alertConfig);
  }
}

// If run directly, start the consumer
if (require.main === module) {
  const consumer = new LogConsumer();

  async function run(): Promise<void> {
    try {
      await consumer.connect();
      await consumer.subscribe(false); // Don't read from beginning in production

      // Start stats reporting
      consumer.startStatsReporting();

      logger.info("🚀 Consumer started and listening for messages...");
      logger.info("📊 Statistics will be reported every 30 seconds");

      await consumer.startConsuming();
    } catch (error) {
      logger.error("Failed to start consumer:", error);
      process.exit(1);
    }
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down consumer gracefully...`);
    try {
      await consumer.disconnect();
      logger.info("Consumer disconnected successfully");
      process.exit(0);
    } catch (error) {
      logger.error("Error during consumer shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  run();
}

// Export the class (remove duplicate export)
export default LogConsumer;
