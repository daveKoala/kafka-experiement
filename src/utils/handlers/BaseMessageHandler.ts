import type {
  MessageHandlerConfig,
  ProcessedMessage,
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
  abstract processBatch(messages: ProcessedMessage[]): Promise<void>;
  abstract processSingle(message: ProcessedMessage): Promise<void>;
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

  // Template method for processing with error handling
  async safeProcessSingle(message: ProcessedMessage): Promise<void> {
    try {
      await this.processSingle(message);
      this.updateStats(true);
    } catch (error) {
      console.error(
        `Handler ${this.name} failed to process single message:`,
        error
      );
      this.updateStats(false);
      throw error;
    }
  }

  async safeProcessBatch(messages: ProcessedMessage[]): Promise<void> {
    try {
      await this.processBatch(messages);
      this.updateStats(true, messages.length);
    } catch (error) {
      console.error(`Handler ${this.name} failed to process batch:`, error);
      this.updateStats(false, messages.length);
      throw error;
    }
  }
}
