import type { Request, Response } from "express";
import type { KafkaConfig } from "./types";
import { KafkaService } from "./KafkaService";

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
    const message = error instanceof Error ? error.message : "Internal Error";
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
    const message = error instanceof Error ? error.message : "Unknown error";
    resp.status(400).json({ message });
  }
};
