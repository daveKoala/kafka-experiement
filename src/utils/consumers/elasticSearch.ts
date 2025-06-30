import type { MessageHandler } from "../kafka/types";
import { esClient } from "../../utils/elasticDB/db";

export const elasticSearchMessageHandler: MessageHandler = async (msg) => {
  try {
    const messageData = JSON.parse(msg.value?.toString() || "{}");

    const document = {
      ...messageData,
      "@timestamp": new Date().toISOString(), // Elasticsearch loves this field
      kafka_topic: msg.topic,
      kafka_partition: msg.partition,
      kafka_offset: msg.offset,
    };

    // Index the document in Elasticsearch
    // 'index()' is used because:

    // Each message gets a unique auto-generated ID
    // We don't care about duplicates
    // We just want to store the data
    const response = await esClient.index({
      index: `kafka-logs-${new Date().toISOString().split("T")[0]}`, // Daily indices like kafka-logs-2025-06-30
      body: document,
    });

    console.log(`Message indexed to Elasticsearch: ${response._id}`);
  } catch (err) {
    console.error(err);
  }
};
