import { Router } from "express";
import { z } from "zod";
import { aiController } from "../controllers/ai.controller.js";
import { authenticate, requireVerifiedEmail } from "../middlewares/auth.middleware.js";
import { patientScope } from "../middlewares/patientScope.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

const language = z.enum(["bn", "en"]).optional();
const medicineInfoBody = z.object({ name: z.string().trim().min(2, "Enter a medicine name").max(80), language });
const interactionsBody = z.object({
  medicines: z.array(z.string().trim().min(2).max(80)).max(15).default([]),
  language,
});
const chatBody = z.object({ message: z.string().trim().min(1, "Type a message").max(1000), language });

router.use(authenticate);

router.get("/usage", aiController.usage);
router.get("/chat", aiController.chatHistory);
router.delete("/chat", aiController.clearChat);

router.use(requireVerifiedEmail, aiLimiter);

router.post("/medicine-info", validate({ body: medicineInfoBody }), aiController.medicineInfo);
router.post("/chat", validate({ body: chatBody }), aiController.chat);
router.post("/interactions", patientScope, validate({ body: interactionsBody }), aiController.interactions);
router.post("/adherence-insight", patientScope, validate({ body: z.object({ language }) }), aiController.adherenceInsight);

export default router;
