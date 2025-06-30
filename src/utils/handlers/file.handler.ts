import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  ProcessedMessage,
  HandlerStatus,
} from "./types";
import fs from "fs/promises";
import path from "path";

export class FileHandler extends BaseMessageHandler {
  private filePath: string;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    this.filePath = config.options?.filePath || "./logs/kafka-messages.log";
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    console.log(`FileHandler initialized: ${this.filePath}`);
  }

  async processSingle(message: ProcessedMessage): Promise<void> {
    console.log({ single: message });
    const logEntry = `${message.timestamp.toISOString()} [${
      message.topic
    }] ${JSON.stringify(message.data)}\n`;
    await fs.appendFile(this.filePath, logEntry);
  }

  async processBatch(messages: ProcessedMessage[]): Promise<void> {
    console.log({ batch: messages });
    const logEntries =
      messages
        .map(
          (msg) =>
            `${msg.timestamp.toISOString()} [${msg.topic}] ${JSON.stringify(
              msg.data
            )}`
        )
        .join("\n") + "\n";

    await fs.appendFile(this.filePath, logEntries);
  }

  async getStatus(): Promise<HandlerStatus> {
    const baseStatus = this.getBaseStatus();
    try {
      const stats = await fs.stat(this.filePath);
      return {
        ...baseStatus,
        details: {
          filePath: this.filePath,
          fileSize: stats.size,
          lastModified: stats.mtime,
        },
      };
    } catch {
      return {
        ...baseStatus,
        details: { filePath: this.filePath, fileExists: false },
      };
    }
  }

  async cleanup(): Promise<void> {
    // File handler doesn't need cleanup
    console.log(`FileHandler ${this.name} cleaned up`);
  }
}
