import type { MessageHandler } from "../kafka/types";
import { sqliteService } from "../localDB/db";

export const sqliteMessageHandler: MessageHandler = async (msg) => {
  try {
    // Validate that the service is initialized
    if (!sqliteService.isInitialized()) {
      console.error("❌ SQLite service not initialized");
      return;
    }

    // Parse the message value to validate it's valid JSON
    let messageData;
    try {
      messageData = JSON.parse(msg.value);
    } catch (parseError) {
      console.error(
        `❌ Invalid JSON in message ${msg.topic}/${msg.offset}:`,
        parseError
      );
      return;
    }

    // Insert the message
    const result = sqliteService.insertMessage(
      msg.topic,
      msg.partition,
      msg.offset,
      msg.key || null,
      msg.value, // Store raw JSON string
      msg.timestamp
    );

    if (result.success) {
      if (result.wasInserted) {
        console.log(
          `💾 Saved to SQLite: ${msg.topic}/${msg.partition}/${msg.offset}`
        );
      } else {
        console.log(
          `⚠️  Duplicate message skipped: ${msg.topic}/${msg.partition}/${msg.offset}`
        );
      }
    } else {
      console.error(
        `❌ Failed to save message: ${msg.topic}/${msg.partition}/${msg.offset}`
      );
    }
  } catch (error) {
    console.error(
      `❌ SQLite handler error for ${msg.topic}/${msg.offset}:`,
      error
    );
    // Don't throw - we don't want to crash the consumer
  }
};
