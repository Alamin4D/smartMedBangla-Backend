import { Router } from "express";
import { z } from "zod";
import { doseController } from "../controllers/dose.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { patientScope } from "../middlewares/patientScope.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { idParam } from "../validators/common.validator.js";

const router = Router();

const historyQuery = z.object({
  patientId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const statsQuery = z.object({ patientId: z.string().optional(), days: z.coerce.number().int().min(1).max(90).default(30) });
const statusBody = z.object({ status: z.enum(["TAKEN", "SKIPPED", "PENDING"]) });

router.use(authenticate, patientScope);

router.get("/today", doseController.today);
router.get("/history", validate({ query: historyQuery }), doseController.history);
router.get("/stats", validate({ query: statsQuery }), doseController.stats);
router.patch("/:id", validate({ params: idParam, body: statusBody }), doseController.updateStatus);

export default router;
