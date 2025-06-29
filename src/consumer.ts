import type { Request, Response } from "express";
import app from "./app";
import { KafkaService } from "./utils/kafka/KafkaService";
import type { MessageHandler } from "./utils/kafka/types";
import { kafkaConfig } from "./utils/kafka/configCommon";

// Singleton of Kafka Service Class
const kafkaServiceConsumer = new KafkaService(kafkaConfig());

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down Kafka producer!");
  await kafkaServiceConsumer.disconnect();
  process.exit(0);
});

const messageHandler: MessageHandler = async (msg) => {
  console.log("📨 Received message:", {
    what: "ho!",
    topic: msg.topic,
    partition: msg.partition,
    offset: msg.offset,
    key: msg.key,
    value: JSON.parse(msg.value), // Parse the JSON value
    timestamp: msg.timestamp,
  });
};

kafkaServiceConsumer.startConsumer(["user-events"], messageHandler);

const PORT = 8082;

app.use("/*{splat}", (_req: Request, res: Response) => {
  // Catch all
  res.statusCode = 404;
});

app.listen(PORT, async () => {
  console.log(`Consumer: Listening on port ${PORT}. http://localhost:${PORT}`);
});

app.listen;
