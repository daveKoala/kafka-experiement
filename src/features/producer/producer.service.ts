import type { Request, Response } from "express";
import type { KafkaConfig, KafkaMessage } from "./types";
import { KafkaService } from "../../utils/kafka/KafkaService";

const kafkaConfig: KafkaConfig = {
  brokersCSV: "localhost:9092",
  clientId: "my-awesome-app",
  connectionTimeout: 3000,
  lingerMs: 1000,
  batchSize: 4,
  retries: 10,
};

// Singleton of Kafka Service Class
const kafkaService = new KafkaService(kafkaConfig);

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down Kafka producer...");
  await kafkaService.disconnect();
  process.exit(0);
});

const sendToTopic = async ([topic, topicMessages]: [
  string,
  KafkaMessage[]
]) => {
  try {
    const result = await kafkaService.sendBatch(topic, topicMessages);
    return {
      topic,
      success: true as const,
      messageCount: topicMessages.length,
      result,
    };
  } catch (topicError) {
    return {
      topic,
      success: false as const,
      messageCount: topicMessages.length,
      error: topicError instanceof Error ? topicError.message : "Unknown error",
    };
  }
};

export const sendDemo = async (req: Request, resp: Response) => {
  try {
    const result = await kafkaService.sendMetric({
      name: "api_request",
      value: 1,
      userId: "user-123",
      metadata: {
        endpoint: req.url,
        method: req.method,
      },
    });

    resp.status(200).json({
      success: true,
      message: "Metric sent successfully",
      result: result[0], // First partition result
    });
  } catch (error) {
    console.error("❌ Failed to send metric:", error);
    const message =
      error instanceof Error ? error.message : "Internal Error: sendDemo";
    resp.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getKafkaStatus = async (_req: Request, resp: Response) => {
  try {
    resp.status(200).json(kafkaService.getStatus());
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error: `getKafkaStatus`";
    resp.status(400).json({ message });
  }
};

export const batchSend = async (
  req: Request,
  resp: Response
): Promise<void> => {
  try {
    const messages = req.body;

    const validMessages: KafkaMessage[] = [];

    // Validation: Check if messages is an array
    if (!Array.isArray(messages)) {
      resp.status(400).json({
        success: false,
        error: "Request body must be an array of messages",
      });
    }

    // Validation: Check if array has messages
    if (messages.length === 0) {
      resp.status(400).json({
        success: false,
        error: "Messages array cannot be empty",
      });
    }

    // Group messages by topic for efficient sending
    const messagesByTopic: Record<string, KafkaMessage[]> = {};

    // @ts-expect-error
    messages.forEach((msg) => {
      const topic = (msg as any).topic; // We know it has topic from validation
      if (!messagesByTopic[topic]) {
        messagesByTopic[topic] = [];
      }

      messagesByTopic[topic].push({
        key: msg.key,
        value: msg.value,
        headers: msg.headers,
      });
    });

    const results = await Promise.all(
      Object.entries(messagesByTopic).map(sendToTopic)
    );

    resp
      .status(200)
      .json({ messagesByTopic, validMessages, messages, results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error: `batch send`";
    resp.status(400).json({ message });
  }
};
