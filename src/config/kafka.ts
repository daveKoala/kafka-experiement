import { Kafka, KafkaConfig, logLevel as kafkaLogLevel } from "kafkajs";
import { logger } from "./logger";

// Topic configuration
export const TOPICS = {
  LOGS: "application-logs",
  METRICS: "application-metrics",
  ERRORS: "application-errors",
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

// Topic configurations for creation
export const TOPIC_CONFIGS = {
  [TOPICS.LOGS]: {
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: "cleanup.policy", value: "delete" },
      { name: "retention.ms", value: "604800000" }, // 7 days
      { name: "segment.ms", value: "86400000" }, // 1 day
      { name: "compression.type", value: "snappy" },
    ],
  },
  [TOPICS.METRICS]: {
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: "cleanup.policy", value: "delete" },
      { name: "retention.ms", value: "2592000000" }, // 30 days
      { name: "segment.ms", value: "86400000" }, // 1 day
      { name: "compression.type", value: "snappy" },
    ],
  },
  [TOPICS.ERRORS]: {
    numPartitions: 2,
    replicationFactor: 1,
    configEntries: [
      { name: "cleanup.policy", value: "delete" },
      { name: "retention.ms", value: "2592000000" }, // 30 days - keep errors longer
      { name: "segment.ms", value: "86400000" }, // 1 day
      { name: "compression.type", value: "snappy" },
    ],
  },
} as const;

// Environment-based configuration
interface KafkaEnvironmentConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?:
    | { mechanism: "plain"; username: string; password: string }
    | { mechanism: "scram-sha-256"; username: string; password: string }
    | { mechanism: "scram-sha-512"; username: string; password: string };
  connectionTimeout: number;
  requestTimeout: number;
  retry: {
    initialRetryTime: number;
    retries: number;
    maxRetryTime: number;
    factor: number;
  };
}

// Get configuration based on environment
function getKafkaConfig(): KafkaEnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV || "development";

  // Parse brokers from environment
  const brokersString = process.env.KAFKA_BROKERS || "localhost:9092";
  const brokers = brokersString.split(",").map((broker) => broker.trim());

  const clientId = process.env.KAFKA_CLIENT_ID || "log-pipeline-app";

  // Base configuration
  const config: KafkaEnvironmentConfig = {
    brokers,
    clientId,
    connectionTimeout: parseInt(
      process.env.KAFKA_CONNECTION_TIMEOUT || "3000",
      10
    ),
    requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || "30000", 10),
    retry: {
      initialRetryTime: parseInt(
        process.env.KAFKA_INITIAL_RETRY_TIME || "100",
        10
      ),
      retries: parseInt(process.env.KAFKA_RETRIES || "8", 10),
      maxRetryTime: parseInt(process.env.KAFKA_MAX_RETRY_TIME || "1000", 10),
      factor: parseFloat(process.env.KAFKA_RETRY_FACTOR || "2"),
    },
  };

  // Add SSL configuration if enabled
  if (process.env.KAFKA_SSL === "true") {
    config.ssl = true;
  }

  // Add SASL configuration if provided
  if (process.env.KAFKA_SASL_MECHANISM) {
    const mechanism = process.env.KAFKA_SASL_MECHANISM;
    const username = process.env.KAFKA_SASL_USERNAME || "";
    const password = process.env.KAFKA_SASL_PASSWORD || "";

    if (mechanism === "plain") {
      config.sasl = { mechanism: "plain", username, password };
    } else if (mechanism === "scram-sha-256") {
      config.sasl = { mechanism: "scram-sha-256", username, password };
    } else if (mechanism === "scram-sha-512") {
      config.sasl = { mechanism: "scram-sha-512", username, password };
    } else {
      throw new Error(`Unsupported SASL mechanism: ${mechanism}`);
    }
  }

  // Environment-specific overrides
  switch (nodeEnv) {
    case "production":
      // Production optimizations
      config.retry.retries = 10;
      config.connectionTimeout = 10000;
      config.requestTimeout = 60000;
      break;

    case "test":
      // Test environment optimizations
      config.retry.retries = 3;
      config.connectionTimeout = 1000;
      config.requestTimeout = 5000;
      break;

    case "development":
    default:
      // Development defaults (already set above)
      break;
  }

  return config;
}

// Custom log creator for KafkaJS
const toWinstonLogLevel = (level: kafkaLogLevel): string => {
  switch (level) {
    case kafkaLogLevel.ERROR:
    case kafkaLogLevel.NOTHING:
      return "error";
    case kafkaLogLevel.WARN:
      return "warn";
    case kafkaLogLevel.INFO:
      return "info";
    case kafkaLogLevel.DEBUG:
    default:
      return "debug";
  }
};

const kafkaLogCreator = (_logLevel: kafkaLogLevel) => {
  return ({ namespace, level, label, log }: any) => {
    const { message, ...extra } = log;
    const winstonLevel = toWinstonLogLevel(level);

    logger.log(winstonLevel, message, {
      namespace,
      label,
      kafka: true,
      ...extra,
    });
  };
};

// Create Kafka instance with environment configuration
const kafkaConfig = getKafkaConfig();

const kafkaClientConfig: KafkaConfig = {
  clientId: kafkaConfig.clientId,
  brokers: kafkaConfig.brokers,
  connectionTimeout: kafkaConfig.connectionTimeout,
  requestTimeout: kafkaConfig.requestTimeout,
  retry: kafkaConfig.retry,
  logLevel: kafkaLogLevel.INFO,
  logCreator: kafkaLogCreator,
};

// Add SSL configuration if present
if (kafkaConfig.ssl) {
  kafkaClientConfig.ssl = true;
}

// Add SASL configuration if present
if (kafkaConfig.sasl) {
  kafkaClientConfig.sasl = kafkaConfig.sasl;
}

export const kafka = new Kafka(kafkaClientConfig);

// Admin client for topic management
export const kafkaAdmin = kafka.admin();

// Utility functions for topic management
export class KafkaTopicManager {
  private static instance: KafkaTopicManager;
  private adminConnected = false;

  private constructor() {}

  public static getInstance(): KafkaTopicManager {
    if (!KafkaTopicManager.instance) {
      KafkaTopicManager.instance = new KafkaTopicManager();
    }
    return KafkaTopicManager.instance;
  }

  public async connectAdmin(): Promise<void> {
    if (!this.adminConnected) {
      try {
        await kafkaAdmin.connect();
        this.adminConnected = true;
        logger.info("Kafka admin client connected");
      } catch (error) {
        logger.error("Failed to connect Kafka admin client:", error);
        throw error;
      }
    }
  }

  public async disconnectAdmin(): Promise<void> {
    if (this.adminConnected) {
      try {
        await kafkaAdmin.disconnect();
        this.adminConnected = false;
        logger.info("Kafka admin client disconnected");
      } catch (error) {
        logger.error("Failed to disconnect Kafka admin client:", error);
        throw error;
      }
    }
  }

  public async createTopics(): Promise<void> {
    await this.connectAdmin();

    try {
      const existingTopics = await kafkaAdmin.listTopics();
      const topicsToCreate = Object.entries(TOPIC_CONFIGS)
        .filter(([topicName]) => !existingTopics.includes(topicName))
        .map(([topicName, config]) => ({
          topic: topicName,
          numPartitions: config.numPartitions,
          replicationFactor: config.replicationFactor,
          configEntries: [...config.configEntries], // Convert readonly to mutable
        }));

      if (topicsToCreate.length > 0) {
        logger.info(
          "Creating topics:",
          topicsToCreate.map((t) => t.topic)
        );

        const createResult = await kafkaAdmin.createTopics({
          topics: topicsToCreate,
          waitForLeaders: true,
          timeout: 30000,
        });

        if (createResult) {
          logger.info(
            "Topics created successfully:",
            topicsToCreate.map((t) => t.topic)
          );
        } else {
          logger.warn("Some topics may already exist or failed to create");
        }
      } else {
        logger.info("All required topics already exist");
      }
    } catch (error) {
      logger.error("Failed to create topics:", error);
      throw error;
    }
  }

  public async deleteTopics(topics: string[]): Promise<void> {
    await this.connectAdmin();

    try {
      logger.warn("Deleting topics:", topics);
      await kafkaAdmin.deleteTopics({
        topics,
        timeout: 30000,
      });
      logger.info("Topics deleted successfully:", topics);
    } catch (error) {
      logger.error("Failed to delete topics:", error);
      throw error;
    }
  }

  public async listTopics(): Promise<string[]> {
    await this.connectAdmin();

    try {
      const topics = await kafkaAdmin.listTopics();
      logger.info("Available topics:", topics);
      return topics;
    } catch (error) {
      logger.error("Failed to list topics:", error);
      throw error;
    }
  }

  public async getTopicMetadata(topics?: string[]): Promise<any> {
    await this.connectAdmin();

    try {
      const metadata = await kafkaAdmin.fetchTopicMetadata({
        topics: topics || Object.values(TOPICS),
      });
      logger.info("Topic metadata retrieved");
      return metadata;
    } catch (error) {
      logger.error("Failed to get topic metadata:", error);
      throw error;
    }
  }

  public async resetConsumerGroup(
    groupId: string,
    topics?: string[]
  ): Promise<void> {
    await this.connectAdmin();

    try {
      logger.warn("Resetting consumer group:", groupId);
      await kafkaAdmin.resetOffsets({
        groupId,
        topic: topics?.[0] || TOPICS.LOGS, // Reset for first topic or logs
        earliest: true,
      });
      logger.info("Consumer group reset successfully:", groupId);
    } catch (error) {
      logger.error("Failed to reset consumer group:", error);
      throw error;
    }
  }

  public async getConsumerGroups(): Promise<any> {
    await this.connectAdmin();

    try {
      const groups = await kafkaAdmin.listGroups();
      logger.info("Consumer groups retrieved");
      return groups;
    } catch (error) {
      logger.error("Failed to get consumer groups:", error);
      throw error;
    }
  }
}

// Health check function
export async function checkKafkaHealth(): Promise<{
  connected: boolean;
  brokers: string[];
  topics: string[];
  error?: string;
}> {
  try {
    const topicManager = KafkaTopicManager.getInstance();
    await topicManager.connectAdmin();

    const topics = await topicManager.listTopics();
    await topicManager.disconnectAdmin();

    return {
      connected: true,
      brokers: kafkaConfig.brokers,
      topics,
    };
  } catch (error) {
    logger.error("Kafka health check failed:", error);
    return {
      connected: false,
      brokers: kafkaConfig.brokers,
      topics: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Configuration export for logging
export const kafkaConfigInfo = {
  brokers: kafkaConfig.brokers,
  clientId: kafkaConfig.clientId,
  ssl: kafkaConfig.ssl || false,
  sasl: kafkaConfig.sasl
    ? { mechanism: kafkaConfig.sasl.mechanism }
    : undefined,
  topics: Object.values(TOPICS),
  environment: process.env.NODE_ENV || "development",
};

// Initialize topics on module load (optional - can be called manually)
export async function initializeKafkaTopics(): Promise<void> {
  try {
    const topicManager = KafkaTopicManager.getInstance();
    await topicManager.createTopics();
    await topicManager.disconnectAdmin();
  } catch (error) {
    logger.error("Failed to initialize Kafka topics:", error);
    // Don't throw - let the application continue
  }
}

logger.info("Kafka configuration loaded:", kafkaConfigInfo);
