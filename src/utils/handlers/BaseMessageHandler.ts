import type {
  MessageHandlerConfig,
  RawKafkaMessage,
  HandlerStatus,
} from "./types";

export abstract class BaseMessageHandler {
  protected config: MessageHandlerConfig;
  protected lastProcessed?: Date | null;
  protected totalProcessed = 0;
  protected name: string;
  protected errors = 0;

  constructor(name: string, config: MessageHandlerConfig) {
    this.name = name;
    this.config = config;
  }

  // Abstract methods that must be implemented
  abstract getStatus(): Promise<HandlerStatus>;
  abstract initialize(): Promise<void>;
  abstract cleanup(): Promise<void>;

  // Common utility methods
  protected updateStats(success: boolean, count: number = 1): void {
    if (success) {
      this.totalProcessed += count;
      this.lastProcessed = new Date();
    } else {
      this.errors += count;
    }
  }

  protected getBaseStatus(): HandlerStatus {
    return {
      name: this.name,
      healthy:
        this.errors === 0 ||
        this.totalProcessed / Math.max(this.errors, 1) > 10,
      lastProcessed: this.lastProcessed ?? null,
      totalProcessed: this.totalProcessed,
      errors: this.errors,
    };
  }

  // Main entry point - takes raw Kafka data and transforms it
  async safeProcessSingle(message: RawKafkaMessage): Promise<void> {
    try {
      console.log(message);
    } catch (error) {
      console.error(`Handler ${this.name} failed to process message:`, error);
      this.updateStats(false);
      throw error;
    }
  }
}
