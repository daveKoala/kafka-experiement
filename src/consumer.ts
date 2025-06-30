import { createMessageHandler } from "./utils/handlers/handlerSelector";
import { KafkaService } from "./utils/kafka/KafkaService";
import { kafkaConfig } from "./utils/kafka/configCommon";
import type { Request, Response } from "express";
import app from "./app";

// We need some sort of factory pattern here that starts kafka AND adds the desired message handler with connections etc

// Singleton of Kafka Service Class
const kafkaServiceConsumer = new KafkaService(
  kafkaConfig(),
  "log-processing-group"
);

const HANDLER_TYPE = process.env.MESSAGE_HANDLER || "sqlite";

let messageHandler: any = null;

// GRACEFUL SHUTDOWN - Include SQLite cleanup
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down services");
  await kafkaServiceConsumer.disconnect();

  if (messageHandler && typeof messageHandler.cleanup === "function") {
    await messageHandler.cleanup();
  }

  process.exit(0);
});

// SIGTERM handler for Docker/production environments
process.on("SIGTERM", async () => {
  console.log("🛑 Received SIGTERM, shutting down services...");
  await kafkaServiceConsumer.disconnect();

  if (messageHandler && typeof messageHandler.cleanup === "function") {
    await messageHandler.cleanup();
  }

  process.exit(0);
});

// Async function to handle startup sequence
async function startServices() {
  try {
    // Message handler
    console.log(`🚀 Starting services with ${HANDLER_TYPE} handler...`);

    // Create the message handler
    messageHandler = await createMessageHandler(HANDLER_TYPE);
    console.log(`✅ ${HANDLER_TYPE} handler initialized`);

    // Start Kafka consumer
    console.log("🔧 Starting Kafka consumer...");
    await kafkaServiceConsumer.startConsumer(["user-events"], messageHandler);

    console.log("✅ All services started successfully!");
  } catch (error) {
    console.error("❌ Failed to start services:", error);
    process.exit(1);
  }
}

const PORT = 8082;

// Add some useful endpoints
app.get("/health", (_req: Request, res: Response) => {
  try {
    const dbInitialized = sqliteService.isInitialized();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        sqlite: dbInitialized ? "connected" : "disconnected",
        kafka: kafkaServiceConsumer.getStatus(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Health check failed",
    });
  }
});

app.get("/stats", (_req: Request, res: Response) => {
  try {
    if (!sqliteService.isInitialized()) {
      return res.status(503).json({ error: "Database not initialized" });
    }

    const stats = sqliteService.getMessageCountByTopic();
    const recentMessages = sqliteService.getRecentMessages(5);
    res.json({
      messageCountByTopic: stats,
      recentMessages: recentMessages.map((msg) => ({
        ...msg,
        message_value: JSON.parse(msg.message_value), // Parse JSON for display
      })),
    });
  } catch (error) {
    console.error("Stats endpoint error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Catch all - fix the route pattern
app.use("/*{splat}", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Start Express server and then initialize services
app.listen(PORT, async () => {
  console.log(`🚀 Consumer server listening on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Stats: http://localhost:${PORT}/stats`);

  // Start services after Express is ready
  await startServices();
});

// Remove this extra line
// app.listen; ← Delete this
