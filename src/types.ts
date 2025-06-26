/**
 * Request interface for logging messages to Kafka
 */
export interface LogRequest {
  /** Log level - defaults to "info" if not specified */
  level?: "info" | "warn" | "error" | "debug";
  /** The log message content */
  message: string;
  /** Optional key-value pairs for additional context */
  metadata?: Record<string, any>;
}

/**
 * Request interface for sending metrics to Kafka
 */
export interface MetricRequest {
  /** The metric name/identifier */
  name: string;
  /** The numeric value of the metric */
  value: number;
  /** Optional tags for metric categorization and filtering */
  tags?: Record<string, any>;
}

/**
 * Request interface for sending multiple log entries in a single operation
 */
export interface BulkLogRequest {
  /** Array of log entries to be sent in bulk */
  logs: Array<{
    /** Log level - defaults to "info" if not specified */
    level?: "info" | "warn" | "error" | "debug";
    /** The log message content */
    message: string;
    /** Optional key-value pairs for additional context */
    metadata?: Record<string, any>;
  }>;
}

/**
 * Request interface for demo/testing purposes
 */
export interface DemoRequest {
  /** Duration in milliseconds for demo execution */
  duration?: number;
}

/**
 * Response interface for health check endpoints
 */
export interface HealthResponse {
  /** Overall health status of the service */
  status: "healthy" | "unhealthy";
  /** Whether the Kafka connection is active */
  kafkaConnected: boolean;
  /** ISO timestamp of when the health check was performed */
  timestamp: string;
  /** Service uptime in milliseconds */
  uptime: number;
  /** Application version string */
  version: string;
}

/**
 * Represents a complete log entry as stored/transmitted in Kafka
 */
export interface LogEntry {
  /** ISO timestamp when the log entry was created */
  timestamp: string;
  /** Severity level of the log entry */
  level: "info" | "warn" | "error" | "debug";
  /** The log message content */
  message: string;
  /** Name of the service that generated this log */
  service: string;
  /** Additional contextual data for the log entry */
  metadata: Record<string, any>;
}

/**
 * Represents a metric data point as stored/transmitted in Kafka
 */
export interface Metric {
  /** ISO timestamp when the metric was recorded */
  timestamp: string;
  /** The metric name/identifier */
  name: string;
  /** The numeric value of the metric */
  value: number;
  /** Tags for metric categorization and filtering */
  tags: Record<string, any>;
}

/**
 * Statistics and status information for the Kafka producer
 */
export interface ProducerStats {
  /** Total number of messages sent since startup */
  totalMessagesSent: number;
  /** Count of messages sent per Kafka topic */
  messagesByTopic: Record<string, number>;
  /** Count of messages sent per log level */
  messagesByLevel: Record<string, number>;
  /** Total number of errors encountered */
  errors: number;
  /** ISO timestamp of the last successfully sent message, null if none */
  lastMessageSent: string | null;
  /** Producer uptime in milliseconds */
  uptime: number;
  /** Whether the producer is currently connected to Kafka */
  isConnected: boolean;
}
