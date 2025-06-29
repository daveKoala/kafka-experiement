import type {
  ConsumedMessage,
  MessageHandler,
  ConsumerStatus,
  KafkaConfig,
} from "./types";
import { BaseKafkaService } from "./BaseKafkaService";

export class KafkaConsumerService extends BaseKafkaService {
  private consumer: any;
  private isRunning: boolean = false;
  private messageHandlers: Map<string, MessageHandler> = new Map();

  constructor(config: KafkaConfig, groupId: string) {
    super(config);

    this.consumer = this.kafka.consumer({
      groupId: groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async connect(): Promise<void> {
    if (!this.isRunning) {
      await this.consumer.connect();
      console.log("✅ Kafka consumer connected");
    }
  }

  async subscribe(topics: string[]): Promise<void> {
    await this.connect();

    for (const topic of topics) {
      await this.consumer.subscribe({
        topic,
        fromBeginning: false,
      });
      console.log(`📡 Subscribed to topic: ${topic}`);
    }
  }

  registerHandler(topic: string, handler: MessageHandler): void {
    this.messageHandlers.set(topic, handler);
    console.log(`🔧 Registered handler for topic: ${topic}`);
  }

  async startConsuming(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Consumer is already running");
    }

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }: any) => {
        try {
          const messageData: ConsumedMessage = {
            topic,
            partition,
            offset: message.offset,
            timestamp: new Date().toISOString(),
            key: message.key?.toString(),
            value: message.value.toString(),
            headers: message.headers || {},
          };

          // Call registered handler
          const handler = this.messageHandlers.get(topic);
          if (handler) {
            await handler(messageData);
          } else {
            console.log(`📨 No handler for topic "${topic}":`, messageData);
          }
        } catch (error) {
          console.error(
            `❌ Error processing message from topic "${topic}":`,
            error
          );
        }
      },
    });

    this.isRunning = true;
    console.log("🏃 Consumer started");
  }

  async stop(): Promise<void> {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.isRunning = false;
      console.log("🛑 Consumer stopped");
    }
  }

  getStatus(): ConsumerStatus {
    return {
      type: "consumer",
      running: this.isRunning,
      clientId: this.config.clientId,
      subscribedTopics: Array.from(this.messageHandlers.keys()),
    };
  }

  async disconnect(): Promise<void> {
    await this.stop();
  }
}
