import { BaseMessageHandler } from "./BaseMessageHandler";
import type {
  MessageHandlerConfig,
  ProcessedMessage,
  HandlerStatus,
  RawKafkaMessage,
} from "./types";
// @ts-expect-error
import { DatabaseSync } from "node:sqlite";
import path from "path";

export class SqlHandler extends BaseMessageHandler {
  // private connectionString: string;
  private tableName: string;
  private db: DatabaseSync | null = null;
  private dbPath: string = "";
  private insertStmt: any = null;
  private batchInsertStmt: any = null;

  constructor(name: string, config: MessageHandlerConfig) {
    super(name, config);
    // this.connectionString = config.options?.connectionString || "";
    this.tableName = config.options?.tableName || "kafka_messages";
  }

  setDbPath(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), "kafka_dac_messages.db");
  }

  async initialize(): Promise<void> {
    try {
      console.log(`SqlHandler initialized for table: ${this.tableName}`);
      this.setDbPath();

      this.db = new DatabaseSync(this.dbPath, {
        open: true,
        readOnly: false,
        enableForeignKeyConstraints: true,
      });

      // Enable WAL mode for better concurrency
      this.db.exec("PRAGMA journal_mode = WAL");
      // Enable better performance settings
      this.db.exec("PRAGMA synchronous = NORMAL");
      this.db.exec("PRAGMA cache_size = 10000");
      this.db.exec("PRAGMA temp_store = MEMORY");

      // Create table
      this.createTables();

      // Prepare statements for better performance
      this.prepareStatements();

      console.log("✅ SQLite handler initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize SQLite handler:", error);
      throw error;
    }
  }

  async safeProcessSingle(rawMessage: RawKafkaMessage): Promise<void> {
    if (!this.insertStmt) {
      throw new Error("Database not initialized - insertStmt is null");
    }

    try {
      // Now we can use the clean RawKafkaMessage interface
      const topic = rawMessage.topic;
      const partition = rawMessage.partition || 0;
      const offset = rawMessage.offset?.toString();
      const messageKey = rawMessage.key || null;
      const messageValue = JSON.stringify(rawMessage.value);
      const kafkaTimestamp = rawMessage.timestamp;
      const processedAt = new Date().toISOString();

      const result = this.insertStmt.run(
        topic,
        partition,
        offset,
        messageKey,
        messageValue,
        kafkaTimestamp,
        processedAt
      );

      if (result.changes > 0) {
        console.log(
          `✅ Message inserted successfully: ${rawMessage.partition}`
        );
      } else {
        console.log(
          `ℹ️  Message already exists (duplicate): ${rawMessage.partition}`
        );
      }
    } catch (error) {
      console.error("❌ Error inserting message:", error);
      throw error; // Re-throw to let the base handler track errors
    }
  }

  async processBatch(messages: ProcessedMessage[]): Promise<void> {
    if (!this.db || !this.batchInsertStmt) {
      throw new Error("Database not initialized");
    }

    try {
      console.log({ messages });
      // Use a transaction for better performance
      const transaction = this.db.transaction(() => {
        let insertedCount = 0;
        let duplicateCount = 0;

        for (const message of messages) {
          const topic = message.topic;
          const partition = message.metadata?.partition || 0;
          const offset = message.metadata?.offset?.toString();
          const messageKey = message.metadata?.key || null;
          const messageValue = JSON.stringify(message);
          const kafkaTimestamp = message.timestamp.toISOString();
          const processedAt = new Date().toISOString();

          const result = this.batchInsertStmt.run(
            topic,
            partition,
            offset,
            messageKey,
            messageValue,
            kafkaTimestamp,
            processedAt
          );

          if (result.changes > 0) {
            insertedCount++;
          } else {
            duplicateCount++;
          }
        }

        return { insertedCount, duplicateCount };
      });

      const result = transaction();
      console.log(
        `✅ Batch insert completed: ${result.insertedCount} inserted, ${result.duplicateCount} duplicates`
      );
    } catch (error) {
      console.error("❌ Error in batch insert:", error);
      throw error;
    }
  }

  async getStatus(): Promise<HandlerStatus> {
    const baseStatus = this.getBaseStatus();

    try {
      let recordCount = 0;
      let dbSize = 0;

      if (this.db) {
        // Get table record count
        const countResult = this.db
          .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`)
          .get();
        recordCount = (countResult as any)?.count || 0;

        // Get database file size
        try {
          const fs = require("fs");
          const stats = fs.statSync(this.dbPath);
          dbSize = stats.size;
        } catch (fsError) {
          console.warn("Could not get database file size:", fsError);
        }
      }

      return {
        ...baseStatus,
        details: {
          tableName: this.tableName,
          dbPath: this.dbPath,
          connected: this.db !== null,
          recordCount,
          dbSizeBytes: dbSize,
          dbSizeMB: Math.round((dbSize / (1024 * 1024)) * 100) / 100,
        },
      };
    } catch (error) {
      return {
        ...baseStatus,
        healthy: false,
        details: {
          tableName: this.tableName,
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.insertStmt) {
        this.insertStmt.finalize?.();
        this.insertStmt = null;
      }

      if (this.batchInsertStmt) {
        this.batchInsertStmt.finalize?.();
        this.batchInsertStmt = null;
      }

      if (this.db) {
        this.db.close();
        this.db = null;
      }

      console.log(`✅ SqlHandler ${this.name} cleaned up successfully`);
    } catch (error) {
      console.error(`❌ Error during SqlHandler cleanup:`, error);
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error("Database not initialized");

    // Create main table with better column types and constraints
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic TEXT NOT NULL,
          partition INTEGER NOT NULL DEFAULT 0,
          offset TEXT NOT NULL,
          message_key TEXT,
          message_value TEXT NOT NULL,
          kafka_timestamp TEXT NOT NULL,
          processed_at TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          -- Prevent duplicate processing
          UNIQUE(topic, partition, offset)
        )
      `);

    // Create indexes for performance
    this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_topic ON ${this.tableName}(topic);
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_processed_at ON ${this.tableName}(processed_at);
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_created_at ON ${this.tableName}(created_at);
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_topic_partition ON ${this.tableName}(topic, partition);
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_kafka_timestamp ON ${this.tableName}(kafka_timestamp);
      `);

    console.log("📋 Database tables and indexes created successfully");
  }

  /**
   * Prepare SQL statements for better performance
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error("Database not initialized");

    // Prepare single insert statement
    this.insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO ${this.tableName} (
          topic, partition, offset, message_key, message_value, 
          kafka_timestamp, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

    // Prepare batch insert statement (same as single, but used in transactions)
    this.batchInsertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO ${this.tableName} (
          topic, partition, offset, message_key, message_value, 
          kafka_timestamp, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

    console.log("🔧 SQL statements prepared successfully");
  }
}
