import { KafkaService } from "../../utils/kafka/KafkaService";
import { MessageHandler, ConsumedMessage } from "../producer/types";

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

const messageHandler = (message: MessageHandler): ConsumedMessage => {
  console.log({ message });

  return message as unknown as ConsumedMessage;
};

export const start = async () => {
  await kafkaService.startConsumer(["user-events"], messageHandler);
};
