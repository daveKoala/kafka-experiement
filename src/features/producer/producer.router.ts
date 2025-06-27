import { Router } from "express";
import * as producer from "./producer.service";

const router = Router();

router.get("/demo", producer.sendDemo);

export default router;
