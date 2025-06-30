import type { KafkaConfig } from "./types";

export const kafkaConfig = (): KafkaConfig => {
  return {
    connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT ?? "3000"),
    brokersCSV: process.env.KAFKA_BROKERS_CSV ?? "localhost:9092",
    clientId: process.env.KAFKA_CLIENT_ID ?? "my-default-app",
    batchSize: parseInt(process.env.KAFKA_BATCH_SIZE ?? "4"),
    retries: parseInt(process.env.KAFKA_RETRIES ?? "10"),
    lingerMs: 1000,
  };
};
