import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  RawKafkaMessage,
  HandlerStatus,
} from "./types";
import fs from "fs/promises";
import path from "path";

export class FileHandler extends BaseMessageHandler {
  private filePath: string;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    this.filePath = config.options?.filePath || "./logs/kafka-dac-messages.log";
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    console.log(`FileHandler initialized: ${this.filePath}`);
  }

  async messageHandler(message: RawKafkaMessage): Promise<void> {
    console.log({ single: message });
    const logEntry = `${message.timestamp} [${message.topic}] ${JSON.stringify(
      message.value
    )}\n`;
    await fs.appendFile(this.filePath, logEntry);
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
