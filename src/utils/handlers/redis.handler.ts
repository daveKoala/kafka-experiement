import { BaseMessageHandler } from "./BaseMessageHandler";
import { createClient, type RedisClientType } from "redis";
import type {
  MessageHandlerConfig,
  RawKafkaMessage,
  HandlerStatus,
} from "./types";

interface RedisHandlerOptions {
  url: string;
  currentLocationTTL?: number; // TTL for current location in seconds (20 minutes)
  historyLimit?: number; // Max number of location history entries
  batchSize?: number;
  flushInterval?: number;
  locationTTL: number;
}

export class RedisHandler extends BaseMessageHandler {
  private redisClient: RedisClientType | null = null;
  private errors: number = 0;
  private options: RedisHandlerOptions;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    this.options = {
      url: process.env.REDIS_URL || "redis://localhost:6379",
      currentLocationTTL: 1200, // 20 minutes
      historyLimit: 100, // Keep last 100 locations
      batchSize: 100,
      locationTTL: 1200, // 20 minutes
      flushInterval: 5000,
      ...config.options,
    };
  }

  async initialize(): Promise<void> {
    try {
      this.redisClient = createClient({
        url: this.options.url,
      });

      this.redisClient.on("error", (err) => {
        console.error(`Redis Client Error (${this.name}):`, err);
        this.errors++;
      });

      this.redisClient.on("connect", () => {
        console.log(`Redis Client Connected (${this.name})`);
      });

      await this.redisClient.connect();
      console.log(`RedisHandler ${this.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize RedisHandler ${this.name}:`, error);
      throw error;
    }
  }

  async messageHandler(message: RawKafkaMessage): Promise<void> {
    if (!this.redisClient) {
      throw new Error("Redis client not initialized");
    }

    try {
      // Parse the message
      const locationData = JSON.parse(message.value);
      const { userId, vehicleId, timeStamp } = locationData;
      const rawMessageValue = message.value;

      // Store with simple keys
      await Promise.all([
        this.redisClient.setEx(
          `location:user:${userId}`,
          this.options.locationTTL!,
          rawMessageValue
        ),
        this.redisClient.setEx(
          `location:vehicle:${vehicleId}`,
          this.options.locationTTL!,
          rawMessageValue
        ),
        this.redisClient.setEx(
          `location:time:${timeStamp}`,
          this.options.locationTTL!,
          rawMessageValue
        ),
      ]);

      console.log(
        `Stored location for user ${userId}, vehicle ${vehicleId} at ${timeStamp}`
      );
      this.totalProcessed++;
    } catch (error) {
      console.error(`Error processing message in ${this.name}:`, error);
      this.errors++;
      throw error;
    }
  }

  async getStatus(): Promise<HandlerStatus> {
    // Return the status of the Redis handler
    return {
      name: this.name,
      healthy: true,
      totalProcessed: 0,
      errors: 0,
      details: {
        connectionInfo: "Connected to Redis",
        batchSize: this.config.options?.batchSize || 100,
        flushInterval: this.config.options?.flushInterval || 5000,
      },
    };
  }

  async cleanup(): Promise<void> {}
}
