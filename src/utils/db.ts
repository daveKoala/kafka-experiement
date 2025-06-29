import { DatabaseSync } from "node:sqlite";
import path from "path";

class SqliteService {
  private db: DatabaseSync | null = null;
  private insertStmt: any = null;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), "kafka_messages.db");
  }

  /**
   * Initialize the database connection and create tables
   * Call this when your service starts
   */
  async initialize(): Promise<void> {
    try {
      console.log(`📂 Connecting to SQLite database: ${this.dbPath}`);

      // Create connection using Node.js built-in SQLite
      this.db = new DatabaseSync(this.dbPath, {
        open: true,
        readOnly: false,
        enableForeignKeyConstraints: true,
      });

      // Enable WAL mode for better concurrency
      this.db.exec("PRAGMA journal_mode = WAL");

      // Create table
      this.createTables();

      // Prepare statements for better performance
      this.prepareStatements();

      console.log("✅ SQLite database initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize SQLite database:", error);
      throw error;
    }
  }

  /**
   * Create the kafka_messages table and indexes
   */
  private createTables(): void {
    if (!this.db) throw new Error("Database not initialized");

    // Create main table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kafka_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        partition INTEGER NOT NULL,
        offset TEXT NOT NULL,
        message_key TEXT,
        message_value TEXT NOT NULL,
        kafka_timestamp TEXT,
        processed_at TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Prevent duplicate processing
        UNIQUE(topic, partition, offset)
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_topic ON kafka_messages(topic);
      CREATE INDEX IF NOT EXISTS idx_processed_at ON kafka_messages(processed_at);
      CREATE INDEX IF NOT EXISTS idx_created_at ON kafka_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_topic_partition ON kafka_messages(topic, partition);
    `);

    console.log("📋 Database tables and indexes created");
  }

  /**
   * Prepare SQL statements for better performance
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error("Database not initialized");

    this.insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO kafka_messages (
        topic, partition, offset, message_key, message_value, 
        kafka_timestamp, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    console.log("🔧 SQL statements prepared");
  }

  /**
   * Insert a Kafka message into the database
   */
  insertMessage(
    topic: string,
    partition: number,
    offset: string,
    messageKey: string | null,
    messageValue: string,
    kafkaTimestamp: string
  ): { success: boolean; wasInserted: boolean } {
    if (!this.insertStmt) {
      throw new Error("Database not initialized or statements not prepared");
    }

    try {
      const result = this.insertStmt.run(
        topic,
        partition,
        offset,
        messageKey,
        messageValue,
        kafkaTimestamp,
        new Date().toISOString()
      );

      // In Node.js SQLite, check changes property
      return {
        success: true,
        wasInserted: result.changes > 0,
      };
    } catch (error) {
      console.error("❌ Error inserting message:", error);
      return {
        success: false,
        wasInserted: false,
      };
    }
  }

  /**
   * Get database instance for custom queries
   */
  getDatabase(): DatabaseSync {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Get message count by topic
   */
  getMessageCountByTopic(): Array<{ topic: string; count: number }> {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare(`
      SELECT topic, COUNT(*) as count 
      FROM kafka_messages 
      GROUP BY topic 
      ORDER BY count DESC
    `);

    return stmt.all() as Array<{ topic: string; count: number }>;
  }

  /**
   * Get recent messages
   */
  getRecentMessages(limit: number = 10): any[] {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare(`
      SELECT * FROM kafka_messages 
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      console.log("🛑 Closing SQLite database connection");
      this.db.close();
      this.db = null;
      this.insertStmt = null;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null && this.db.isOpen;
  }

  /**
   * Check if currently in a transaction
   */
  isInTransaction(): boolean {
    return this.db ? this.db.isTransaction : false;
  }

  /**
   * Get database file location
   */
  getLocation(): string | null {
    return this.db ? this.db.location() : null;
  }
}

// Create singleton instance
export const sqliteService = new SqliteService();

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  await sqliteService.close();
});

process.on("SIGTERM", async () => {
  await sqliteService.close();
});

export default SqliteService;
