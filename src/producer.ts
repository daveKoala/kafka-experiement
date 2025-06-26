import { Producer, ProducerRecord, RecordMetadata } from "kafkajs";
import type { LogEntry, Metric, ProducerStats } from "./types";
import { kafka, TOPICS } from "./config/kafka";
import { logger } from "./config/logger";
import * as os from "os";

export class LogProducer {
  private producer: Producer;
  private _isConnected: boolean = false;
  private stats: Omit<ProducerStats, "uptime" | "isConnected"> = {
    totalMessagesSent: 0,
    messagesByTopic: {},
    messagesByLevel: {},
    errors: 0,
    lastMessageSent: null,
  };
  private readonly startTime: number;

  constructor() {
    this.producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 1000,
        factor: 2,
      },
    });
    this.startTime = Date.now();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.producer.on("producer.connect", () => {
      logger.info("Kafka producer connected");
    });

    this.producer.on("producer.disconnect", () => {
      logger.info("Kafka producer disconnected");
      this._isConnected = false;
    });

    this.producer.on("producer.network.request_timeout", (payload) => {
      logger.warn("Kafka producer request timeout", payload);
      this.stats.errors++;
    });
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this._isConnected = true;
      logger.info("Kafka producer connected successfully");
    } catch (error) {
      this._isConnected = false;
      logger.error("Failed to connect Kafka producer:", error);
      throw new Error(
        `Failed to connect to Kafka: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      this._isConnected = false;
      logger.info("Kafka producer disconnected successfully");
    } catch (error) {
      logger.error("Error disconnecting Kafka producer:", error);
      throw new Error(
        `Failed to disconnect from Kafka: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async sendLog(
    level: LogEntry["level"],
    message: string,
    metadata: Record<string, any> = {}
  ): Promise<LogEntry> {
    this.validateConnection();
    this.validateLogInput(level, message);

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: message.trim(),
      service: metadata.service || "log-producer",
      metadata: {
        ...metadata,
        hostname: os.hostname(),
        pid: process.pid,
        nodeVersion: process.version,
        platform: os.platform(),
      },
    };

    const topic = this.getTopicForLevel(level);
    const messageKey = this.generateMessageKey(logEntry.service, level);

    try {
      const record: ProducerRecord = {
        topic,
        messages: [
          {
            key: messageKey,
            value: JSON.stringify(logEntry),
            headers: {
              "content-type": "application/json",
              level: level,
              service: logEntry.service,
              timestamp: logEntry.timestamp,
              hostname: os.hostname(),
            },
            timestamp: Date.now().toString(),
          },
        ],
      };

      const recordMetadata: RecordMetadata[] = await this.producer.send(record);

      // Update statistics
      this.updateStats(topic, level, logEntry.timestamp);

      logger.debug(`Log sent to ${topic}:`, {
        level,
        message: message.substring(0, 100), // Truncate for logging
        partition: recordMetadata[0]?.partition,
        offset: recordMetadata[0]?.offset,
      });

      return logEntry;
    } catch (error) {
      this.stats.errors++;
      const errorMessage = `Failed to send log to Kafka: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage, { level, message, topic });
      throw new Error(errorMessage);
    }
  }

  public async sendMetric(
    metricName: string,
    value: number,
    tags: Record<string, any> = {}
  ): Promise<Metric> {
    this.validateConnection();
    this.validateMetricInput(metricName, value);

    const metric: Metric = {
      timestamp: new Date().toISOString(),
      name: metricName.trim(),
      value,
      tags: {
        ...tags,
        hostname: os.hostname(),
        service: tags.service || "log-producer",
        environment: process.env.NODE_ENV || "development",
      },
    };

    const messageKey = this.generateMessageKey("metrics", metricName);

    try {
      const record: ProducerRecord = {
        topic: TOPICS.METRICS,
        messages: [
          {
            key: messageKey,
            value: JSON.stringify(metric),
            headers: {
              "content-type": "application/json",
              "metric-name": metricName,
              "metric-value": value.toString(),
              timestamp: metric.timestamp,
              hostname: os.hostname(),
            },
            timestamp: Date.now().toString(),
          },
        ],
      };

      const recordMetadata: RecordMetadata[] = await this.producer.send(record);

      // Update statistics
      this.updateStats(TOPICS.METRICS, "metric", metric.timestamp);

      logger.debug(`Metric sent to ${TOPICS.METRICS}:`, {
        metricName,
        value,
        partition: recordMetadata[0]?.partition,
        offset: recordMetadata[0]?.offset,
      });

      return metric;
    } catch (error) {
      this.stats.errors++;
      const errorMessage = `Failed to send metric to Kafka: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage, { metricName, value });
      throw new Error(errorMessage);
    }
  }

  public async sendBatch(
    records: ProducerRecord[]
  ): Promise<RecordMetadata[][]> {
    this.validateConnection();

    if (records.length === 0) {
      throw new Error("Cannot send empty batch");
    }

    if (records.length > 100) {
      throw new Error("Batch size cannot exceed 100 records");
    }

    try {
      const results = await this.producer.sendBatch({
        topicMessages: records,
      });

      // Update stats for batch
      records.forEach((record) => {
        this.updateStats(record.topic, "batch", new Date().toISOString());
      });

      logger.info(`Batch of ${records.length} messages sent successfully`);

      console.log({ records });
      // @ts-expect-error
      return results;
    } catch (error) {
      this.stats.errors += records.length;
      const errorMessage = `Failed to send batch to Kafka: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage, { batchSize: records.length });
      throw new Error(errorMessage);
    }
  }

  // Generate sample logs for demo purposes
  public async generateSampleLogs(): Promise<LogEntry> {
    const logTemplates = [
      {
        level: "info" as const,
        message: "User authentication successful",
        metadata: {
          userId: Math.floor(Math.random() * 1000),
          sessionId: this.generateSessionId(),
          authMethod: "oauth2",
        },
      },
      {
        level: "warn" as const,
        message: "High memory usage detected",
        metadata: {
          memoryUsage: `${Math.floor(Math.random() * 20) + 80}%`,
          threshold: "85%",
        },
      },
      {
        level: "error" as const,
        message: "Database connection timeout",
        metadata: {
          connectionString: "postgresql://db.example.com:5432/app",
          timeout: "5000ms",
          retryAttempt: Math.floor(Math.random() * 3) + 1,
        },
      },
      {
        level: "info" as const,
        message: "API request processed successfully",
        metadata: {
          endpoint: `/api/users/${Math.floor(Math.random() * 1000)}`,
          method: "GET",
          responseTime: Math.floor(Math.random() * 500) + 50,
          statusCode: 200,
        },
      },
      {
        level: "debug" as const,
        message: "Cache operation completed",
        metadata: {
          operation: Math.random() > 0.5 ? "SET" : "GET",
          cacheKey: `user:${Math.floor(Math.random() * 1000)}`,
          hit: Math.random() > 0.3,
        },
      },
      {
        level: "warn" as const,
        message: "Rate limit approaching threshold",
        metadata: {
          currentRequests: Math.floor(Math.random() * 20) + 80,
          limit: 100,
          timeWindow: "1m",
          clientIp: this.generateRandomIp(),
        },
      },
    ];

    const randomTemplate =
      logTemplates[Math.floor(Math.random() * logTemplates.length)];
    const logEntry = await this.sendLog(
      randomTemplate.level,
      randomTemplate.message,
      {
        ...randomTemplate.metadata,
        source: "demo-generator",
        demoId: this.generateDemoId(),
      }
    );

    // Occasionally send a metric along with the log
    if (Math.random() < 0.4) {
      const metricTemplates = [
        {
          name: "response_time_ms",
          value: Math.floor(Math.random() * 1000) + 100,
        },
        { name: "active_users", value: Math.floor(Math.random() * 500) + 50 },
        {
          name: "memory_usage_percent",
          value: Math.floor(Math.random() * 40) + 60,
        },
        { name: "request_count", value: Math.floor(Math.random() * 100) + 10 },
        { name: "error_rate_percent", value: Math.random() * 5 },
      ];

      const randomMetric =
        metricTemplates[Math.floor(Math.random() * metricTemplates.length)];
      await this.sendMetric(randomMetric.name, randomMetric.value, {
        source: "demo-generator",
        environment: "demo",
      });
    }

    return logEntry;
  }

  public getStats(): ProducerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
      isConnected: this._isConnected,
    };
  }

  public resetStats(): void {
    this.stats = {
      totalMessagesSent: 0,
      messagesByTopic: {},
      messagesByLevel: {},
      errors: 0,
      lastMessageSent: null,
    };
    logger.info("Producer statistics reset");
  }

  // Private helper methods
  private validateConnection(): void {
    if (!this._isConnected) {
      throw new Error("Producer not connected to Kafka. Call connect() first.");
    }
  }

  private validateLogInput(level: string, message: string): void {
    const validLevels = ["info", "warn", "error", "debug"];
    if (!validLevels.includes(level)) {
      throw new Error(
        `Invalid log level: ${level}. Must be one of: ${validLevels.join(", ")}`
      );
    }

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      throw new Error("Message must be a non-empty string");
    }

    if (message.length > 10000) {
      throw new Error("Message length cannot exceed 10,000 characters");
    }
  }

  private validateMetricInput(metricName: string, value: number): void {
    if (
      !metricName ||
      typeof metricName !== "string" ||
      metricName.trim().length === 0
    ) {
      throw new Error("Metric name must be a non-empty string");
    }

    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new Error("Metric value must be a finite number");
    }

    if (metricName.length > 255) {
      throw new Error("Metric name length cannot exceed 255 characters");
    }
  }

  private getTopicForLevel(level: LogEntry["level"]): string {
    return level === "error" ? TOPICS.ERRORS : TOPICS.LOGS;
  }

  private generateMessageKey(service: string, identifier: string): string {
    return `${service}-${identifier}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDemoId(): string {
    return `demo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private generateRandomIp(): string {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(
      Math.random() * 255
    )}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }

  private updateStats(topic: string, level: string, timestamp: string): void {
    this.stats.totalMessagesSent++;
    this.stats.messagesByTopic[topic] =
      (this.stats.messagesByTopic[topic] || 0) + 1;
    this.stats.messagesByLevel[level] =
      (this.stats.messagesByLevel[level] || 0) + 1;
    this.stats.lastMessageSent = timestamp;
  }
}

// Export for CLI and standalone usage
export default LogProducer;
