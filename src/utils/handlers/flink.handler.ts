import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  RawKafkaMessage,
  HandlerStatus,
} from "./types";

// This handler has not been finished. But what i am doing here is when the consumer starts with the  'flink' handler it will connect to Flink and instruct that to consume directly. But i dont know hwo to do this yet
export class FlinkHandler extends BaseMessageHandler {
  private flinkUrl: string;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    this.flinkUrl = config.options?.flinkUrl || "http://localhost:8081";
  }

  async initialize(): Promise<void> {
    try {
      // Test Flink connection using JobManager API
      await this.testFlinkConnection();
      console.log(
        `FlinkHandler ${this.name} initialized - connected to Flink cluster`
      );
    } catch (error) {
      console.log("FlinkHandler initialization error:", error);
    }
  }

  private async httpClient(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.flinkUrl}${endpoint}`;
    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  private async testFlinkConnection(): Promise<void> {
    // Use JobManager overview endpoint to test connection
    await this.httpClient("/overview");
  }

  async messageHandler(message: RawKafkaMessage): Promise<void> {
    // For proof of concept, just log that Flink would process this
    // In reality, Flink jobs would consume directly from Kafka topics
    console.log(`Flink would process message from topic: ${message.topic}`);
  }

  async getStatus(): Promise<HandlerStatus> {
    try {
      const overview = await this.httpClient("/overview");
      const jobs = await this.httpClient("/jobs");

      return {
        ...this.getBaseStatus(),
        healthy: true,
        metadata: {
          flinkCluster: {
            taskmamagers: overview.taskmanagers,
            slotsTotal: overview["slots-total"],
            slotsAvailable: overview["slots-available"],
            jobsRunning: overview["jobs-running"],
            version: overview["flink-version"],
          },
          activeJobs: jobs.jobs || [],
        },
      };
    } catch (error) {
      return {
        ...this.getBaseStatus(),
        healthy: false,
        lastProcessed: null,
        details: { 0: "Cannot connect to Flink JobManager" },
      };
    }
  }

  async cleanup(): Promise<void> {
    console.log(`FlinkHandler ${this.name} cleaned up`);
  }

  // Helper methods for interacting with Flink
  async getJobs(): Promise<any> {
    return await this.httpClient("/jobs");
  }

  async getJobDetails(jobId: string): Promise<any> {
    return await this.httpClient(`/jobs/${jobId}`);
  }

  // For future: submit job (requires uploading JAR first)
  async getUploadedJars(): Promise<any> {
    return await this.httpClient("/jars");
  }
}
