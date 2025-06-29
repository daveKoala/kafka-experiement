import type { KafkaConfig } from "./types";

export const kafkaConfig = (): KafkaConfig => {
  return {
    brokersCSV: "localhost:9092",
    clientId: "my-awesome-app",
    connectionTimeout: 3000,
    lingerMs: 1000,
    batchSize: 4,
    retries: 10,
  };
};
