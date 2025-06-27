import { Router } from "express";
import * as producer from "./producer.service";

const router = Router();

router.get("/demo", producer.sendDemo);

router.get("/status", producer.getKafkaStatus);

export default router;
