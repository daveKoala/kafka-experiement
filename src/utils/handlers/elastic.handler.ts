import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  RawKafkaMessage,
  HandlerStatus,
} from "./types";

import { Client } from "@elastic/elasticsearch";

export class ElasticHandler extends BaseMessageHandler {
  private client: any; // Would be ElasticSearch client
  private indexName: string;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    this.indexName = config.options?.indexName || "kafka-messages";
  }

  async initialize(): Promise<void> {
    // Initialize Elasticsearch client
    this.client = new Client({
      node: this.config.options?.url || "http://localhost:9200",
    });
    console.log(`ElasticHandler initialized for index: ${this.indexName}`);
  }

  async messageHandler(message: RawKafkaMessage): Promise<void> {
    try {
      console.log(
        `Indexing to Elasticsearch: ${this.indexName}`,
        message?.partition
      );

      let parsedValue;
      try {
        parsedValue = JSON.parse(message.value as string);
      } catch {
        parsedValue = message.value; // Keep as string if not valid JSON
      }

      // Simple flat document - no complex parsing FFS!
      const document = {
        topic: message.topic, // Direct access, no nesting
        partition: message.partition, // Direct access
        offset: message.offset, // Direct access
        messageKey: message.key, // Direct access
        messageValue: message.value, // Direct access - already string or number
        timestamp: message.timestamp, // Direct access
        headers: message.headers, // Direct access
      };

      await this.client.index({
        index: this.indexName,
        id: message?.offset || Date.now(),
        body: document,
      });

      this.updateStats(true);
    } catch (error) {
      console.error("❌ Error indexing to Elasticsearch:", error);
      this.updateStats(false);
      throw error;
    }
  }

  async getStatus(): Promise<HandlerStatus> {
    const baseStatus = this.getBaseStatus();
    return {
      ...baseStatus,
      details: {
        indexName: this.indexName,
        connected: true, // Would check actual connection
      },
    };
  }

  async cleanup(): Promise<void> {
    // Close Elasticsearch connection
    await this.client.close();
    console.log(`ElasticHandler ${this.name} cleaned up`);
  }
}
