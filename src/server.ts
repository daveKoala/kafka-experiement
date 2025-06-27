import type { Request, Response } from "express";
import express from "express";
import morgan from "morgan";
import ProducerRouter from "./features/producer/producer.router";

const app = express();

const PORT = 8081;

app
  .use(express.json())
  .use(morgan(":method :url :status :res[content-length] - :response-time ms"));

app.use("/api", ProducerRouter);

app.use("/*{splat}", (_req: Request, res: Response) => {
  // Catch all
  res.statusCode = 404;
});

app.listen(PORT, async () => {
  console.log(`Listening on port ${PORT}. http://localhost:8081`);
});
