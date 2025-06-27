import { Kafka } from "kafkajs";
import type { Config } from "./types";

//   clientId: "my-app", // Just a string identifier for the application
//   brokers: ["kafka1:9092", "kafka2:9092"],
//   brokers: ["kafka:29092"] // If running this app inside the container
//   brokers: ["localhost:9092"], // If this app is running outside a container

class KafkaProducerService {
  private kafka: any;
  private producer: any;
  private isConnected: boolean = false;

  constructor(config: Config) {
    this.kafka = new Kafka({
      clientId: config.thisAppsName,
      // Extract the host:port strings
      brokers: config.brokersCSV
        .split(",")
        .map((broker) => broker.trim())
        .filter((broker: string) => broker.length > 0),
      // Add connection resilience
      connectionTimeout: config.connectionTimeout,
      authenticationTimeout: config.authenticationTimeout,
      reauthenticationThreshold: config.reauthenticationThreshold,
      retry: {
        initialRetryTime: config.retry.initialRetryTime,
        retries: config.retry.retries,
      },
    });

    this.producer = this.kafka.producer({
      // Performance optimizations
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      // Batching for better throughput
      batch: {
        size: 16384, // 16KB batches
        lingerMs: 10, // Wait 10ms to batch messages
      },
    });
  }
  async connect() {
    if (!this.isConnected) {
      await this.producer.connect();
      this.isConnected = true;
      console.log("✅ Kafka producer connected");
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log("👋 Kafka producer disconnected");
    }
  }

  async sendMetric(metricData: {
    name: string;
    value: number;
    userId?: string;
    metadata?: Record<string, any>;
  }) {
    await this.connect();

    const message = {
      timestamp: new Date().toISOString(),
      ...metricData,
      source: "api-service",
    };

    return this.producer.send({
      topic: "application-metrics",
      messages: [
        {
          // Use key for partitioning (same user goes to same partition)
          key: metricData.userId || "anonymous",
          value: JSON.stringify(message),
          // Add headers for metadata
          headers: {
            "content-type": "application/json",
            source: "api-service",
            version: "1.0",
          },
        },
      ],
    });
  }

  // 3. BATCH SENDING - More efficient
  async sendBatch(
    messages: Array<{
      topic: string;
      key?: string;
      value: any;
      headers?: Record<string, string>;
    }>
  ) {
    await this.connect();

    const topicMessages: Record<string, any[]> = {};

    // Group by topic
    messages.forEach((msg) => {
      if (!topicMessages[msg.topic]) {
        topicMessages[msg.topic] = [];
      }

      topicMessages[msg.topic].push({
        key: msg.key,
        value:
          typeof msg.value === "string" ? msg.value : JSON.stringify(msg.value),
        headers: msg.headers || {},
        timestamp: Date.now().toString(),
      });
    });

    // Send to each topic
    const results = [];
    for (const [topic, msgs] of Object.entries(topicMessages)) {
      const result = await this.producer.send({
        topic,
        messages: msgs,
      });
      results.push({ topic, result });
    }

    return results;
  }

  async sendWithRetry(topic: string, message: any, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.connect();
        return await this.producer.send({
          topic,
          messages: [
            {
              value: JSON.stringify(message),
              timestamp: Date.now().toString(),
            },
          ],
        });
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(`❌ Send attempt ${attempt} failed:`, message);

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

export default KafkaProducerService;
