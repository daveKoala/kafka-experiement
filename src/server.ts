import { config } from "dotenv";
config();

import app from "./app";
import ProducerRouter from "./features/producer/producer.router";
import type { Request, Response } from "express";

const PORT = process.env.PRODUCER_PORT ?? 8080;

app.use("/api", ProducerRouter);

app.use("/*{splat}", (_req: Request, res: Response) => {
  // Catch all
  res.statusCode = 404;
});

app.listen(PORT, async () => {
  console.log(`Producer: Listening on port ${PORT}. http://localhost:${PORT}`);
});
