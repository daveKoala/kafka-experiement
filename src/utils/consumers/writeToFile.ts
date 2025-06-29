import type { MessageHandler } from "../kafka/types";
import fs from "fs/promises";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");

const ensureLogsDirectory = async (dir: string) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

export const messageHandler: MessageHandler = async (msg) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const filename = `${msg.topic}-${today}.jsonl`;
    const filepath = path.join(LOGS_DIR, filename);

    await ensureLogsDirectory(LOGS_DIR); // ← Don't forget await!

    await fs.appendFile(filepath, JSON.stringify(msg.value) + "\n");
  } catch (err) {
    console.error(err);
  }
};
