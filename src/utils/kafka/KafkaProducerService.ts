import type {
  ProducerStatus,
  KafkaMessage,
  KafkaConfig,
  MetricData,
} from "../../features/producer/types";
import { BaseKafkaService } from "./BaseKafkaService";

//   clientId: "my-app", // Just a string identifier for the application
//   brokers: ["kafka1:9092", "kafka2:9092"],
//   brokers: ["kafka:29092"] // If running this app inside the container
//   brokers: ["localhost:9092"], // If this app is running outside a container

export class KafkaProducerService extends BaseKafkaService {
  private producer: any;
  private isConnected: boolean = false;

  constructor(config: KafkaConfig) {
    super(config);

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      batch: {
        size: config.batchSize || 16384,
        lingerMs: config.lingerMs || 10,
      },
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.producer.connect();
      this.isConnected = true;
      console.log("✅ Kafka producer connected");
    }
  }

  async sendMessage(topic: string, message: KafkaMessage): Promise<any> {
    await this.connect();

    const kafkaMessage = {
      key: message.key,
      value:
        typeof message.value === "string"
          ? message.value
          : JSON.stringify(message.value),
      headers: {
        "content-type": "application/json",
        timestamp: new Date().toISOString(),
        ...message.headers,
      },
    };

    return this.producer.send({
      topic,
      messages: [kafkaMessage],
    });
  }

  async sendMetric(metricData: MetricData): Promise<any> {
    const message: KafkaMessage = {
      key: metricData.userId || "anonymous",
      value: {
        timestamp: new Date().toISOString(),
        ...metricData,
        source: this.config.serviceName || "api-service",
      },
      headers: {
        source: this.config.serviceName || "api-service",
        version: "1.0",
      },
    };

    return this.sendMessage("application-metrics", message);
  }

  async sendBatch(topic: string, messages: KafkaMessage[]): Promise<any> {
    await this.connect();

    const kafkaMessages = messages.map((msg) => ({
      key: msg.key,
      value:
        typeof msg.value === "string" ? msg.value : JSON.stringify(msg.value),
      headers: {
        "content-type": "application/json",
        timestamp: new Date().toISOString(),
        ...msg.headers,
      },
    }));

    return this.producer.send({
      topic,
      messages: kafkaMessages,
    });
  }

  getStatus(): ProducerStatus {
    return {
      type: "producer",
      connected: this.isConnected,
      clientId: this.config.clientId,
    };
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log("👋 Kafka producer disconnected");
    }
  }
}

export default KafkaProducerService;
