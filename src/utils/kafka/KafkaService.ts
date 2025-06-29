import { KafkaConsumerService } from "./KafkaConsumerService";
import { KafkaProducerService } from "./KafkaProducerService";
import type {
  MessageHandler,
  ServiceStatus,
  KafkaMessage,
  KafkaConfig,
  MetricData,
} from "../../features/producer/types";

export class KafkaService {
  private producer: KafkaProducerService;
  private consumer: KafkaConsumerService;

  constructor(config: KafkaConfig, consumerGroupId: string = "default-group") {
    this.producer = new KafkaProducerService(config);
    this.consumer = new KafkaConsumerService(config, consumerGroupId);
  }

  // Producer methods
  async sendMetric(metricData: MetricData): Promise<any> {
    return this.producer.sendMetric(metricData);
  }

  async sendMessage(topic: string, message: KafkaMessage): Promise<any> {
    return this.producer.sendMessage(topic, message);
  }

  async sendBatch(topic: string, messages: KafkaMessage[]): Promise<any> {
    return this.producer.sendBatch(topic, messages);
  }

  // Consumer methods
  async startConsumer(
    topics: string[],
    handler: MessageHandler
  ): Promise<void> {
    await this.consumer.subscribe(topics);

    // Register handler for all topics
    topics.forEach((topic) => {
      this.consumer.registerHandler(topic, handler);
    });

    await this.consumer.startConsuming();
  }

  async stopConsumer(): Promise<void> {
    await this.consumer.stop();
  }

  // Status methods
  getStatus(): ServiceStatus {
    return {
      producer: this.producer.getStatus(),
      consumer: this.consumer.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.producer.disconnect(), this.consumer.disconnect()]);
  }
}
