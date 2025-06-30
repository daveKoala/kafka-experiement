import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  ProcessedMessage,
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

  async processSingle(message: ProcessedMessage): Promise<void> {
    // Simulate Elasticsearch indexing
    console.log(`Indexing to Elasticsearch: ${this.indexName}`, message.id);
    await this.client.index({
      index: this.indexName,
      id: message.id,
      body: message,
    });
  }

  async processBatch(messages: ProcessedMessage[]): Promise<void> {
    // Simulate bulk indexing
    console.log(`Bulk indexing ${messages.length} messages to Elasticsearch`);
    // const body = messages.flatMap(msg => [
    //   { index: { _index: this.indexName, _id: msg.id } },
    //   msg
    // ]);
    // await this.client.bulk({ body });
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
