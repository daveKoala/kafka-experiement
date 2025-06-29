/**
 * Configuration object for Kafka service initialization
 */
export interface KafkaConfig {
  /** Comma-separated list of Kafka broker addresses (e.g., "localhost:9092,kafka2:9092") */
  brokersCSV: string;

  /** Unique identifier for this Kafka client instance */
  clientId: string;

  /** Optional service name used for message metadata and logging */
  serviceName?: string;

  /** Connection timeout in milliseconds (default: 3000) */
  connectionTimeout?: number;

  /** Number of retry attempts for failed operations (default: 8) */
  retries?: number;

  /** Maximum batch size in bytes for producer batching (default: 16384) */
  batchSize?: number;

  /** Time in milliseconds to wait for batching messages before sending (default: 10) */
  lingerMs?: number;
}

/**
 * Structure for a Kafka message to be sent to a topic
 */
export interface KafkaMessage {
  /** Optional partition key - messages with same key go to same partition */
  key?: string;

  /** Message payload - can be string, object, or any serializable data */
  value: any;

  /** Optional metadata headers attached to the message */
  headers?: Record<string, string>;
}

/**
 * Structure for application metrics data
 */
export interface MetricData {
  /** Name/type of the metric (e.g., "api_request", "user_login") */
  name: string;

  /** Numeric value of the metric */
  value: number;

  /** Optional user ID associated with this metric */
  userId?: string;

  /** Optional additional metadata about the metric */
  metadata?: Record<string, any>;
}

/**
 * Structure representing a message consumed from a Kafka topic
 */
export interface ConsumedMessage {
  /** Name of the topic this message came from */
  topic: string;

  /** Partition number within the topic (0-based) */
  partition: number;

  /** Unique offset/position of this message within the partition */
  offset: string;

  /** ISO timestamp when the message was processed by consumer */
  timestamp: string;

  /** Optional partition key of the original message */
  key?: string;

  /** Message payload as string (needs parsing if JSON) */
  value: string;

  /** Message headers/metadata as key-value pairs */
  headers: Record<string, any>;
}

/**
 * Function type for handling consumed messages
 * @param message - The consumed message to process
 * @returns Promise that resolves when message processing is complete
 */
export type MessageHandler = (message: ConsumedMessage) => Promise<void>;

/**
 * Status information for a Kafka producer instance
 */
export interface ProducerStatus {
  /** Type identifier for this status object */
  type: "producer";

  /** Whether the producer is currently connected to Kafka */
  connected: boolean;

  /** Client ID of this producer instance */
  clientId: string;
}

/**
 * Status information for a Kafka consumer instance
 */
export interface ConsumerStatus {
  /** Type identifier for this status object */
  type: "consumer";

  /** Whether the consumer is currently running and processing messages */
  running: boolean;

  /** Client ID of this consumer instance */
  clientId: string;

  /** Array of topic names this consumer is subscribed to */
  subscribedTopics: string[];
}

/**
 * Combined status information for a complete Kafka service
 */
export interface ServiceStatus {
  /** Status of the producer component */
  producer: ProducerStatus;

  /** Status of the consumer component */
  consumer: ConsumerStatus;

  /** ISO timestamp when this status was generated */
  timestamp: string;
}
