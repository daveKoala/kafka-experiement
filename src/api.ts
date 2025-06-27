import { logger } from "./config/logger";

import { ApiServer } from "./ApiServer";

// Start the server if this file is run directly
if (require.main === module) {
  const server = new ApiServer();
  server.start().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}

export { ApiServer };
