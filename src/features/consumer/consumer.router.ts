import { Router } from "express";
import * as consumerService from "./consumerService";
import type { KafkaConfig, KafkaMessage } from "../producer/types";

const router = Router();

router.get("/start", consumerService.start);

export default router;
