import { config } from "dotenv";
config();

import express from "express";
import morgan from "morgan";

const app = express();

app
  .use(express.json())
  .use(morgan(":method :url :status :res[content-length] - :response-time ms"));

export default app;
