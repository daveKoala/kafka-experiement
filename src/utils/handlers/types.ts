/**
 * Configuration for message handlers that process Kafka messages
 */
export interface MessageHandlerConfig {
  /** The type of handler to instantiate (elastic, sql, file, table, webhook) */
  type: "elastic" | "sql" | "file" | "table" | "webhook";

  /** Whether this handler is enabled and should process messages */
  enabled: boolean;

  /** Number of messages to batch together before processing (optional, defaults to 1 for single processing) */
  batchSize?: number;

  /** Interval in milliseconds to flush batched messages (optional, used with batchSize) */
  flushInterval?: number;

  /** Handler-specific configuration options (e.g., connection strings, file paths, URLs) */
  options?: Record<string, any>;

  topics?: string[];
}

/**
 * Standardized message format after processing from Kafka
 */
export interface ProcessedMessage {
  /** Unique identifier for this message */
  id: string;

  /** Kafka topic this message originated from */
  topic: string;

  /** The actual message payload/content */
  data: any;

  /** When this message was processed */
  timestamp: Date;

  /** Additional metadata about the message (partition, offset, headers, etc.) */
  metadata?: Record<string, any>;
}

/**
 * Health and performance status information for a message handler
 */
export interface HandlerStatus {
  /** Name/identifier of the handler */
  name: string;

  /** Whether the handler is currently healthy and functioning properly */
  healthy: boolean;

  /** Timestamp of the last successfully processed message */
  lastProcessed?: Date | null;

  /** Total number of messages successfully processed by this handler */
  totalProcessed: number;

  /** Total number of errors encountered by this handler */
  errors: number;

  /** Handler-specific status details (connection info, performance metrics, etc.) */
  details?: Record<string, any>;

  metadata?: any;
}

/**
 * Raw Kafka message structure as received
 */
export interface RawKafkaMessage {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string | null;
  value: string;
  headers: Record<string, any>;
}

export type MessageHandlerTypes =
  | "file"
  | "sql"
  | "sqlite"
  | "elastic"
  | "elasticsearch"
  | "flink"
  | "redis";
