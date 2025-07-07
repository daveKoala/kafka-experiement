import { MessageHandlerConfig, MessageHandlerTypes } from "./types";
import { BaseMessageHandler } from "./BaseMessageHandler";
import { ElasticHandler } from "./elastic.handler";
import { FlinkHandler } from "./flink.handler";
import { FileHandler } from "./file.handler";
import { SqlHandler } from "./sql.handler";
import { RedisHandler } from "./redis.handler";

/**
 * Simple function to get a handler based on name
 */
export function getHandler(
  handlerName: MessageHandlerTypes
): BaseMessageHandler {
  const config: MessageHandlerConfig = {
    type: handlerName as any,
    enabled: true,
    options: getHandlerOptions(handlerName),
  };

  switch (handlerName) {
    case "file":
      return new FileHandler("fileHandler", config);

    case "sql":
    case "sqlite":
      return new SqlHandler("sqlHandler", config);

    case "elastic":
    case "elasticsearch":
      return new ElasticHandler("elasticHandler", config);

    case "flink":
      return new FlinkHandler("flinkHandler", config);

    case "redis":
      return new RedisHandler("redisHandler", config);

    default:
      throw new Error(
        `Unknown handler: ${handlerName}. Available: file, sql, elastic`
      );
  }
}

/**
 * Get default options for each handler type
 */
function getHandlerOptions(handlerName: string): Record<string, any> {
  switch (handlerName) {
    case "file":
      return {
        filePath: process.env.LOG_FILE_PATH || "./logs/kafka-dac-processed.log",
      };

    case "sql":
    case "sqlite":
      return {
        tableName: process.env.DB_TABLE_NAME || "kafka_messages",
      };

    case "elastic":
    case "elasticsearch":
      return {
        url: process.env.ELASTICSEARCH_URL || "redis://localhost:6379",
        indexName: process.env.ES_INDEX_NAME || "kafka-messages",
        maxBulkSize: parseInt(process.env.ES_BATCH_SIZE || "1000"),
        flushInterval: parseInt(process.env.ES_FLUSH_INTERVAL || "2000"),
      };

    case "flink":
      return {
        type: "flink",
        enabled: true,
        topics: ["user-logs", "error-logs", "user-events", "apple-pie"],
        options: {
          flinkUrl: "http://localhost:8081",
        },
      };

    case "redis":
      return {
        type: "redis",
        enabled: true,
        options: {
          redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
          redisKeyPrefix: process.env.REDIS_KEY_PREFIX || "kafka_messages",
          batchSize: parseInt(process.env.REDIS_BATCH_SIZE || "100"),
          flushInterval: parseInt(process.env.REDIS_FLUSH_INTERVAL || "5000"),
        },
      };

    default:
      return {};
  }
}

/**
 * Create a message handler function that can be passed to Kafka
 */
export async function createMessageHandler(handlerName: MessageHandlerTypes) {
  const handler = getHandler(handlerName);
  await handler.initialize();

  // Return the actual function that Kafka will call
  return async (topic: any) => {
    await handler.messageHandler(topic);
  };
}
