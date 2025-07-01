import { KafkaService } from "../../utils/kafka/KafkaService";
import { kafkaConfig } from "../../utils/kafka/configCommon";
import type { KafkaMessage } from "../../utils/kafka/types";
import type { Request, Response } from "express";

// Singleton of Kafka Service Class
const kafkaService = new KafkaService(
  kafkaConfig(),
  process.env.CONSUMER_GROUP_NAME ?? "dave-rocks"
);

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down Kafka producer");
  await kafkaService.disconnect();
  process.exit(0);
});

const sendToTopic = async ([topic, topicMessages]: [
  string,
  KafkaMessage[]
]) => {
  try {
    const result = await kafkaService.sendBatch(topic, topicMessages);
    return {
      topic,
      success: true as const,
      messageCount: topicMessages.length,
      result,
    };
  } catch (topicError) {
    return {
      topic,
      success: false as const,
      messageCount: topicMessages.length,
      error: topicError instanceof Error ? topicError.message : "Unknown error",
    };
  }
};

export const sendDemo = async (req: Request, resp: Response) => {
  try {
    const result = await kafkaService.sendMetric({
      name: "api_request",
      value: 1,
      userId: "user-123",
      metadata: {
        endpoint: req.url,
        method: req.method,
      },
    });

    resp.status(200).json({
      success: true,
      message: "Metric sent successfully",
      result: result[0], // First partition result
    });
  } catch (error) {
    console.error("❌ Failed to send metric:", error);
    const message =
      error instanceof Error ? error.message : "Internal Error: sendDemo";
    resp.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getKafkaStatus = async (_req: Request, resp: Response) => {
  try {
    resp.status(200).json(kafkaService.getStatus());
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error: `getKafkaStatus`";
    resp.status(400).json({ message });
  }
};

export const batchSend = async (
  req: Request,
  resp: Response
): Promise<void> => {
  try {
    const messages = req.body;
    const validMessages: KafkaMessage[] = [];
    const errors: Array<{
      topic?: string;
      error: string;
      messageIndex?: number;
    }> = [];

    // Validation: Check if messages is an array
    if (!Array.isArray(messages)) {
      resp.status(400).json({
        success: false,
        error: "Request body must be an array of messages",
      });
    }

    // Validation: Check if array has messages
    if (messages.length === 0) {
      resp.status(400).json({
        success: false,
        error: "Messages array cannot be empty",
      });
    }

    // Group messages by topic for efficient sending
    const messagesByTopic: Record<string, KafkaMessage[]> = {};

    // Validate each message and group by topic
    messages.forEach((msg: any, index: number) => {
      try {
        // Add message validation here
        if (!msg.topic) {
          errors.push({
            error: `Message at index ${index} missing required 'topic' field`,
            messageIndex: index,
          });
          return;
        }

        if (!msg.value) {
          errors.push({
            topic: msg.topic,
            error: `Message at index ${index} missing required 'value' field`,
            messageIndex: index,
          });
          return;
        }

        const topic = msg.topic;
        if (!messagesByTopic[topic]) {
          messagesByTopic[topic] = [];
        }

        messagesByTopic[topic].push({
          key: msg.key,
          value: msg.value,
          headers: msg.headers,
        });

        validMessages.push(msg);
      } catch (validationError) {
        errors.push({
          error: `Validation error for message at index ${index}: ${
            validationError instanceof Error
              ? validationError.message
              : "Unknown validation error"
          }`,
          messageIndex: index,
        });
      }
    });

    // If we have validation errors, return them before attempting to send
    if (errors.length > 0 && validMessages.length === 0) {
      resp.status(400).json({
        success: false,
        error: "All messages failed validation",
        errors,
        totalMessages: messages.length,
        validMessages: 0,
      });
    }

    // Send messages to Kafka with enhanced error handling
    const results = await Promise.allSettled(
      Object.entries(messagesByTopic).map(async ([topic, topicMessages]) => {
        try {
          const result = await sendToTopic([topic, topicMessages]);
          return {
            topic,
            success: true,
            messageCount: topicMessages.length,
            result,
          };
        } catch (kafkaError) {
          // Capture specific Kafka errors
          const errorMessage =
            kafkaError instanceof Error
              ? kafkaError.message
              : "Unknown Kafka error";

          // Log the error for debugging (you might want to use your logging system here)
          console.error(`Kafka send error for topic ${topic}:`, {
            error: errorMessage,
            topic,
            messageCount: topicMessages.length,
            timestamp: new Date().toISOString(),
          });

          errors.push({
            topic,
            error: `Failed to send to topic '${topic}': ${errorMessage}`,
          });

          return {
            topic,
            success: false,
            error: errorMessage,
            messageCount: topicMessages.length,
          };
        }
      })
    );

    // Process results and separate successful from failed sends
    const successfulSends = results
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === "fulfilled" && result.value.success
      )
      .map((result) => result.value);

    const failedSends = results
      .filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" && !result.value.success)
      )
      .map((result) => {
        if (result.status === "rejected") {
          return {
            error: result.reason?.message || "Unknown rejection reason",
          };
        } else {
          return result.value;
        }
      });

    // Determine response status based on results
    const hasErrors = errors.length > 0 || failedSends.length > 0;
    const hasSuccesses = successfulSends.length > 0;

    let statusCode = 200;
    if (hasErrors && !hasSuccesses) {
      statusCode = 500; // All failed
    } else if (hasErrors && hasSuccesses) {
      statusCode = 207; // Partial success (Multi-Status)
    }

    const response = {
      success: !hasErrors,
      totalMessages: messages.length,
      validMessages: validMessages.length,
      successfulTopics: successfulSends.length,
      failedTopics: failedSends.length,
      ...(successfulSends.length > 0 && { successfulSends }),
      ...(failedSends.length > 0 && { failedSends }),
      ...(errors.length > 0 && { validationErrors: errors }),
    };

    resp.status(statusCode).json(response);
  } catch (error) {
    // Catch-all for unexpected errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error in batch send";

    // Log the unexpected error
    console.error("Unexpected error in batchSend:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    resp.status(500).json({
      success: false,
      error: "Internal server error during batch send",
      message: errorMessage,
    });
  }
};
