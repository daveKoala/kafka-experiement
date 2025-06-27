import type { Request, Response } from "express";
import type { Config } from "./types";
import KafkaProducerService from "./KafkaProducerService";

const kafkaConfig: Config = {
  thisAppsName: "my-awesome-app",
  brokersCSV: "localhost:9092",
  connectionTimeout: 3000,
  authenticationTimeout: 1000,
  reauthenticationThreshold: 1000,
  retry: {
    initialRetryTime: 100,
    retries: 10,
  },
};

// Singleton of Kafka Producer Class
const kafkaService = new KafkaProducerService(kafkaConfig);

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down Kafka producer...");
  await kafkaService.disconnect();
  process.exit(0);
});

export const sendDemo = async (_req: Request, resp: Response) => {
  try {
    const result = await kafkaService.sendMetric({
      name: "api_request",
      value: 1,
      userId: "user-123",
      metadata: {
        endpoint: "/demo",
        method: "POST",
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
