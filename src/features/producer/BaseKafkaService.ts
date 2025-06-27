import { Kafka } from "kafkajs";
import type { KafkaConfig } from "./types";

// Base Kafka Service Class
export abstract class BaseKafkaService {
  protected kafka: any;
  protected config: KafkaConfig;

  constructor(config: KafkaConfig) {
    this.config = config;

    const brokers = config.brokersCSV
      .split(",")
      .map((str: string) => str.trim())
      .filter((broker) => broker.length > 0);

    if (brokers.length === 0) {
      throw new Error("No valid Kafka brokers configured");
    }

    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: brokers,
      connectionTimeout: config.connectionTimeout || 3000,
      retry: {
        initialRetryTime: 100,
        retries: config.retries || 8,
      },
    });

    console.log(
      `🚀 Kafka service initialized with ${brokers.length} broker(s)`
    );
  }

  // Common health check method
  async isHealthy(): Promise<boolean> {
    try {
      // Basic connectivity test
      return true; // Could implement actual health check logic
    } catch (error) {
      console.error("❌ Kafka health check failed:", error);
      return false;
    }
  }

  // Abstract method that subclasses must implement
  abstract disconnect(): Promise<void>;
}
