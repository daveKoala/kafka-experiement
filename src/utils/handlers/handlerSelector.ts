import { BaseMessageHandler } from "./BaseMessageHandler";
import { ElasticHandler } from "./elastic.handler";
import { MessageHandlerConfig } from "./types";
import { FileHandler } from "./file.handler";
import { SqlHandler } from "./sql.handler";

/**
 * Simple function to get a handler based on name
 */
export function getHandler(handlerName: string): BaseMessageHandler {
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
        filePath: process.env.LOG_FILE_PATH || "./logs/kafka-processed.log",
      };

    case "sql":
    case "sqlite":
      return {
        tableName: process.env.DB_TABLE_NAME || "kafka_messages",
      };

    case "elastic":
    case "elasticsearch":
      return {
        url: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
        indexName: process.env.ES_INDEX_NAME || "kafka-messages",
        maxBulkSize: parseInt(process.env.ES_BATCH_SIZE || "1000"),
        flushInterval: parseInt(process.env.ES_FLUSH_INTERVAL || "2000"),
      };

    default:
      return {};
  }
}

/**
 * Create a message handler function that can be passed to Kafka
 */
export async function createMessageHandler(handlerName: string) {
  const handler = getHandler(handlerName);
  await handler.initialize();

  // Return the actual function that Kafka will call
  return async (topic: any) => {
    await handler.safeProcessSingle(topic);
  };
}
